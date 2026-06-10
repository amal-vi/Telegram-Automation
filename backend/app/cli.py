import asyncio
import logging
from datetime import datetime
from typing import List, Dict, Any
from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.prompt import Prompt, Confirm
from rich import print as rprint
from rich.align import Align

from .config import Config
from .database import Database
from .client_manager import TelegramClientManager
from .scanner import TelegramScanner
from .analyzer import SpamAnalyzer
from .policy_engine import PolicyEngine
from .executor import ActionExecutor

logger = logging.getLogger("SpamAgent.CLI")

class SpamAgentCLI:
    def __init__(self, config: Config, db: Database, client_manager: TelegramClientManager):
        self.config = config
        self.db = db
        self.client_manager = client_manager
        self.console = Console()
        
        # Instantiate other services
        client = self.client_manager.get_client()
        self.scanner = TelegramScanner(client, self.config, self.db)
        self.analyzer = SpamAnalyzer(self.config)
        self.policy_engine = PolicyEngine(self.config)
        self.executor = ActionExecutor(client, self.config, self.db)

    def print_banner(self):
        self.console.clear()
        banner_text = """
    ███████╗██████╗  █████╗ ███╗   ███╗     █████╗  ██████╗ ███████╗███╗   ██╗████████╗
    ██╔════╝██╔══██╗██╔══██╗████╗ ████║    ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝
    ███████╗██████╔╝███████║██╔████╔██║    ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   
    ╚════██║██╔═══╝ ██╔══██║██║╚██╔╝██║    ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   
    ███████║██║     ██║  ██║██║ ╚═╝ ██║    ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   
    ╚══════╝╚═╝     ╚═╝  ╚═╝╚═╝     ╚═╝    ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   
        """
        
        status_info = (
            f"[bold cyan]Dry Run:[/bold cyan] {'[green]ON[/green]' if self.config.dry_run else '[red]OFF (Caution)[/red]'}  |  "
            f"[bold cyan]Human Approval:[/bold cyan] {'[green]ON[/green]' if self.config.human_approval_mode else '[red]OFF[/red]'}  |  "
            f"[bold cyan]Database:[/bold cyan] {self.config.db_path}\n"
            f"[bold cyan]Gemini Fallback:[/bold cyan] {'[green]Enabled[/green]' if self.analyzer.gemini_enabled else '[yellow]Disabled (No API Key)[/yellow]'}"
        )
        
        panel = Panel(
            Align.center(f"[bold magenta]{banner_text}[/bold magenta]\n{status_info}"),
            title="[bold white]Telegram Spam Agent - V1.0[/bold white]",
            subtitle="[italic white]Secure your Telegram channels and groups[/italic white]",
            border_style="magenta"
        )
        self.console.print(panel)

    async def run_scan(self):
        """Runs a complete scan of all groups and executes action policy."""
        self.console.print("\n[bold yellow]🔄 Initiating group scan...[/bold yellow]")
        
        try:
            # 1. Fetch groups
            groups = await self.scanner.fetch_groups_and_channels()
            if not groups:
                self.console.print("[yellow]No groups or channels found to scan.[/yellow]")
                return

            # Prepare results table
            table = Table(title="Scan Results & Proposed Decisions", show_header=True, header_style="bold magenta")
            table.add_column("Group ID", style="dim", width=12)
            table.add_column("Title", width=25)
            table.add_column("Type", width=12)
            table.add_column("Status", width=10)
            table.add_column("Score", justify="right", width=8)
            table.add_column("Decision", width=10)
            table.add_column("Reason", width=35)

            scanned_details = []
            
            with self.console.status("[bold cyan]Scanning and analyzing messages...[/bold cyan]", spinner="dots"):
                for idx, g in enumerate(groups):
                    group_id = g["id"]
                    title = g["title"]
                    username = g["username"]
                    group_type = g["type"]
                    dialog = g["dialog"]
                    
                    # Check list conditions
                    is_whitelisted = g["is_whitelisted"]
                    is_blacklisted = g["is_blacklisted"]
                    
                    score = 0.0
                    reason = "Ignored"
                    details = {}
                    
                    if is_whitelisted:
                        action = "ignore"
                        reason = "Whitelisted"
                    elif is_blacklisted:
                        action = "leave"
                        reason = "Blacklisted"
                    else:
                        # Sample recent messages
                        messages = await self.scanner.sample_messages(dialog)
                        # Compute spam score
                        score, reason, details = await self.analyzer.analyze_spam_score(messages)
                        # Apply policy to decide action
                        action, reason = self.policy_engine.determine_action(score, is_whitelisted, is_blacklisted)

                    # Update database with current scan results
                    self.db.update_group_scan(group_id, score)

                    # Store for execution phase
                    scanned_details.append({
                        "id": group_id,
                        "title": title,
                        "entity": dialog.entity,
                        "action": action,
                        "score": score,
                        "reason": reason
                    })

                    # Add row to results table
                    color = "green"
                    if action == "leave":
                        color = "red"
                    elif action == "archive":
                        color = "orange3"
                    elif action == "mute":
                        color = "yellow"
                    
                    db_group = self.db.get_group(group_id)
                    cur_status = db_group["status"] if db_group else "active"

                    table.add_row(
                        str(group_id),
                        title[:22] + "..." if len(title) > 22 else title,
                        group_type,
                        cur_status,
                        f"{score:.1f}",
                        f"[{color}]{action.upper()}[/{color}]",
                        reason
                    )

            self.console.print(table)

            # 2. Execute Policy Actions
            actions_to_execute = [s for s in scanned_details if s["action"] != "ignore"]
            if not actions_to_execute:
                self.console.print("\n[green]✅ Scan completed. No spam groups detected. No actions needed.[/green]")
                return

            self.console.print(f"\n[bold yellow]⚠️  Found {len(actions_to_execute)} group(s) matching action policies.[/bold yellow]")
            
            for item in actions_to_execute:
                # Get current status to make sure we don't repeat action if already done
                db_group = self.db.get_group(item["id"])
                if db_group and db_group["status"] == "left" and item["action"] == "leave":
                    continue
                if db_group and db_group["status"] == "muted" and item["action"] == "mute":
                    continue
                if db_group and db_group["status"] == "archived" and item["action"] == "archive":
                    continue

                success, status_msg = await self.executor.execute_action(
                    group_id=item["id"],
                    title=item["title"],
                    dialog_entity=item["entity"],
                    action=item["action"],
                    score=item["score"],
                    reason=item["reason"]
                )
                
                # Visual output for status
                status_color = "green" if success else "red"
                self.console.print(f"  • {item['title']}: {item['action'].upper()} -> [{status_color}]{status_msg}[/{status_color}]")

            self.console.print("\n[green]✅ Policy execution complete.[/green]")

        except Exception as e:
            self.console.print(f"[bold red]Scan error: {e}[/bold red]")
            logger.exception("Error during scan execution")

    def manage_whitelist(self):
        """Interactive whitelist management sub-menu."""
        while True:
            self.console.print("\n[bold cyan]--- Whitelist Management ---[/bold cyan]")
            whitelist = self.db.get_whitelist()
            
            if whitelist:
                self.console.print("[bold white]Current Whitelisted Entities:[/bold white]")
                for item in whitelist:
                    self.console.print(f"  • {item}")
            else:
                self.console.print("[italic dim]Whitelist is empty.[/italic dim]")
                
            self.console.print("\n[white]Options: 1. Add Entity  2. Remove Entity  3. Back to Main Menu[/white]")
            opt = Prompt.ask("Choose option", choices=["1", "2", "3"])
            
            if opt == "1":
                entity = Prompt.ask("Enter entity to whitelist (ID, @username, or Title substring)")
                if entity.strip():
                    self.db.add_to_whitelist(entity)
                    self.console.print(f"[green]Added '{entity}' to whitelist.[/green]")
            elif opt == "2":
                entity = Prompt.ask("Enter entity to remove")
                if entity.strip():
                    self.db.remove_from_whitelist(entity)
                    self.console.print(f"[green]Removed '{entity}' from whitelist.[/green]")
            else:
                break

    def manage_blacklist(self):
        """Interactive blacklist management sub-menu."""
        while True:
            self.console.print("\n[bold cyan]--- Blacklist Management ---[/bold cyan]")
            blacklist = self.db.get_blacklist()
            
            if blacklist:
                self.console.print("[bold white]Current Blacklisted Entities:[/bold white]")
                for item in blacklist:
                    self.console.print(f"  • {item}")
            else:
                self.console.print("[italic dim]Blacklist is empty.[/italic dim]")
                
            self.console.print("\n[white]Options: 1. Add Entity  2. Remove Entity  3. Back to Main Menu[/white]")
            opt = Prompt.ask("Choose option", choices=["1", "2", "3"])
            
            if opt == "1":
                entity = Prompt.ask("Enter entity to blacklist (ID, @username, or Title substring)")
                if entity.strip():
                    self.db.add_to_blacklist(entity)
                    self.console.print(f"[green]Added '{entity}' to blacklist.[/green]")
            elif opt == "2":
                entity = Prompt.ask("Enter entity to remove")
                if entity.strip():
                    self.db.remove_from_blacklist(entity)
                    self.console.print(f"[green]Removed '{entity}' from blacklist.[/green]")
            else:
                break

    def show_audit_logs(self):
        """Displays execution/audit logs from DB."""
        logs = self.db.get_action_logs(limit=25)
        if not logs:
            self.console.print("[italic dim]No audit logs found.[/italic dim]")
            return
            
        table = Table(title="Execution Audit Logs", show_header=True, header_style="bold magenta")
        table.add_column("Timestamp", width=20)
        table.add_column("Group Title", width=20)
        table.add_column("Action", width=10)
        table.add_column("Score", justify="right", width=8)
        table.add_column("Dry Run", width=8)
        table.add_column("Status", width=12)
        table.add_column("Reason/Error", width=30)
        
        for log in logs:
            action_color = "red" if log["action"] == "leave" else ("orange3" if log["action"] == "archive" else "yellow")
            status_color = "green" if log["status"] == "success" else "red"
            
            # Format timestamp nicely
            ts = log["timestamp"]
            try:
                dt = datetime.fromisoformat(ts)
                ts_formatted = dt.strftime("%Y-%m-%d %H:%M:%S")
            except:
                ts_formatted = ts
                
            table.add_row(
                ts_formatted,
                log["group_title"][:18] + "..." if len(log["group_title"]) > 18 else log["group_title"],
                f"[{action_color}]{log['action'].upper()}[/{action_color}]",
                f"{log['score']:.1f}",
                "YES" if log["is_dry_run"] == 1 else "NO",
                f"[{status_color}]{log['status'].upper()}[/{status_color}]",
                log["reason"] or ""
            )
            
        self.console.print(table)

    def toggle_dry_run(self):
        """Toggles the dry run mode on/off."""
        self.config.dry_run = not self.config.dry_run
        # Write back to raw config memory (in actual app, you'd write to yaml if desired,
        # but changing in runtime config object is sufficient for active session).
        self.console.print(f"[yellow]Dry Run mode toggled. Now: {'[green]ON[/green]' if self.config.dry_run else '[red]OFF (CAUTION: Real actions will be performed!)[/red]'}[/yellow]")

    async def run_daemon(self):
        """Runs the daemon mode (scans periodically)."""
        self.console.print(f"\n[bold yellow]🤖 Starting Daemon Mode (scans every {self.config.scan_interval_minutes} minutes)...[/bold yellow]")
        self.console.print("[dim]Press Ctrl+C to stop the daemon and return to main menu.[/dim]\n")
        
        try:
            while True:
                time_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                self.console.print(f"\n[bold cyan]📅 [{time_str}] Starting periodic scan...[/bold cyan]")
                
                # Perform scan
                await self.run_scan()
                
                self.console.print(f"[dim]Next scan in {self.config.scan_interval_minutes} minute(s)...[/dim]")
                
                # Sleep interval
                await asyncio.sleep(self.config.scan_interval_minutes * 60)
        except asyncio.CancelledError:
            self.console.print("\n[yellow]Daemon mode stopped.[/yellow]")
        except KeyboardInterrupt:
            self.console.print("\n[yellow]Daemon mode stopped by user.[/yellow]")

    async def start(self):
        """CLI Main loop entry point."""
        while True:
            self.print_banner()
            self.console.print("\n[bold white]MAIN MENU[/bold white]")
            self.console.print("1. [bold green]Scan & Manage Groups Now[/bold green]")
            self.console.print("2. Manage Whitelist")
            self.console.print("3. Manage Blacklist")
            self.console.print("4. View Action Audit Logs")
            self.console.print("5. Toggle Dry-Run Mode")
            self.console.print("6. Run Daemon Mode (Periodic scan)")
            self.console.print("7. Exit")
            
            choice = Prompt.ask("\nSelect option", choices=["1", "2", "3", "4", "5", "6", "7"])
            
            if choice == "1":
                await self.run_scan()
                Prompt.ask("\nPress Enter to return to menu")
            elif choice == "2":
                self.manage_whitelist()
            elif choice == "3":
                self.manage_blacklist()
            elif choice == "4":
                self.show_audit_logs()
                Prompt.ask("\nPress Enter to return to menu")
            elif choice == "5":
                self.toggle_dry_run()
                Prompt.ask("\nPress Enter to return to menu")
            elif choice == "6":
                # Start daemon task
                try:
                    await self.run_daemon()
                except (KeyboardInterrupt, asyncio.CancelledError):
                    pass
                Prompt.ask("\nPress Enter to return to menu")
            elif choice == "7":
                self.console.print("[bold cyan]Goodbye! Thank you for using Spam Agent.[/bold cyan]")
                break
