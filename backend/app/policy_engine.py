from typing import Dict, Any, Tuple
from .config import Config

class PolicyEngine:
    def __init__(self, config: Config):
        self.config = config

    def determine_action(self, score: float, is_whitelisted: bool, is_blacklisted: bool) -> Tuple[str, str]:
        """
        Determines the appropriate action based on the spam score and list flags.
        Returns a tuple of (action, reason).
        Actions can be: 'leave', 'archive', 'mute', 'ignore'
        """
        if is_blacklisted:
            return "leave", "Group is explicitly blacklisted"
            
        if is_whitelisted:
            return "ignore", "Group is explicitly whitelisted"

        if score >= self.config.spam_threshold_leave:
            return "leave", f"Spam score {score:.1f} >= leave threshold ({self.config.spam_threshold_leave})"
            
        if score >= self.config.spam_threshold_archive:
            return "archive", f"Spam score {score:.1f} >= archive threshold ({self.config.spam_threshold_archive})"
            
        if score >= self.config.spam_threshold_mute:
            return "mute", f"Spam score {score:.1f} >= mute threshold ({self.config.spam_threshold_mute})"
            
        return "ignore", f"Spam score {score:.1f} is clean (below all thresholds)"
