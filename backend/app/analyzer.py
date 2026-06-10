import re
import json
import logging
from typing import List, Dict, Any, Tuple
import google.generativeai as genai
from .config import Config

logger = logging.getLogger("SpamAgent.Analyzer")

class SpamAnalyzer:
    def __init__(self, config: Config):
        self.config = config
        self._setup_gemini()
        
        # Compile regular expressions for speed
        self.link_pattern = re.compile(r"https?://\S+|www\.\S+|t\.me/\S+", re.IGNORECASE)
        self.mention_pattern = re.compile(r"@\w+", re.IGNORECASE)
        
        # Word lists for keyword density check
        self.spam_keywords = [
            "crypto", "airdrop", "presale", "pump", "binance", "signals", "trading", 
            "forex", "profit", "giveaway", "free tokens", "solana", "bitcoin", "ethereum", 
            "doge", "memecoin", "investment", "earn daily", "casino", "slots", "betting", 
            "porn", "sex", "nude", "onlyfans", "make money", "passive income", "referral link",
            "join chat", "whatsapp group", "get rich", "leak video", "xxx", "escort",
            "free", "claim", "rewards", "gift", "bonus"
        ]

    def _setup_gemini(self):
        """Initializes Google GenAI if API key is provided."""
        self.gemini_enabled = False
        if self.config.gemini_api_key:
            try:
                genai.configure(api_key=self.config.gemini_api_key)
                self.gemini_enabled = True
                logger.info("Gemini LLM fallback initialized successfully.")
            except Exception as e:
                logger.error(f"Failed to initialize Gemini API: {e}")

    def compute_rule_score(self, messages: List[Dict[str, Any]]) -> Tuple[float, Dict[str, Any]]:
        """
        Computes rule-based spam score based on message heuristics.
        Returns a tuple of (score, details).
        """
        if not messages:
            return 0.0, {"reason": "No messages to analyze"}

        total_msgs = len(messages)
        empty_or_no_text_count = 0
        link_messages_count = 0
        mention_messages_count = 0
        forwarded_count = 0
        bot_sent_count = 0
        keyword_matches = 0
        
        message_texts = []
        unique_texts = set()
        
        for msg in messages:
            text = msg.get("text", "").strip()
            if not text:
                empty_or_no_text_count += 1
                continue
                
            message_texts.append(text)
            unique_texts.add(text.lower())
            
            # Check for links
            if self.link_pattern.search(text):
                link_messages_count += 1
                
            # Check for mentions
            mentions = self.mention_pattern.findall(text)
            if len(mentions) >= 3: # Heavy mentioning is spammy
                mention_messages_count += 1
                
            # Check forwards
            if msg.get("is_forwarded", False):
                forwarded_count += 1
                
            # Check bots
            if msg.get("is_bot", False):
                bot_sent_count += 1
                
            # Check keywords
            text_lower = text.lower()
            if any(keyword in text_lower for keyword in self.spam_keywords):
                keyword_matches += 1

        # Avoid Division by Zero
        analyzable_count = total_msgs - empty_or_no_text_count
        if analyzable_count == 0:
            return 0.0, {"reason": "All messages are empty or media-only"}

        # Ratios
        link_ratio = link_messages_count / analyzable_count
        forward_ratio = forwarded_count / analyzable_count
        bot_ratio = bot_sent_count / analyzable_count
        keyword_ratio = keyword_matches / analyzable_count
        mention_ratio = mention_messages_count / analyzable_count
        
        # Repetition (uniqueness score: 0 to 1, where 1 means all unique, 0 means all identical)
        uniqueness_ratio = len(unique_texts) / len(message_texts) if message_texts else 1.0
        repetition_score = 1.0 - uniqueness_ratio

        # Calculate weighted score (0 to 100)
        # Component weights:
        # - Keyword density: 30 points max
        # - Repetition score: 30 points max
        # - Links ratio: 25 points max
        # - Forwarded messages ratio: 15 points max
        # - Heavy mention ratio: 15 points max
        
        keyword_points = min(30.0, keyword_ratio * 30.0 * 1.5)
        repetition_points = repetition_score * 30.0
        link_points = min(25.0, link_ratio * 25.0 * 1.2)
        forward_points = min(15.0, forward_ratio * 15.0)
        mention_points = min(15.0, mention_ratio * 15.0)
        
        raw_score = keyword_points + repetition_points + link_points + forward_points + mention_points
        
        # Apply joint heuristic bonus for high link density combined with repetition
        if link_ratio > 0.6 and repetition_score > 0.5:
            raw_score += 10.0

        # Apply bot boost if high ratio of messages from bots
        if bot_ratio > 0.3:
            raw_score += 15.0
            
        final_score = min(100.0, max(0.0, raw_score))
        
        details = {
            "total_sampled": total_msgs,
            "keyword_ratio": round(keyword_ratio, 2),
            "repetition_ratio": round(repetition_score, 2),
            "link_ratio": round(link_ratio, 2),
            "forward_ratio": round(forward_ratio, 2),
            "mention_ratio": round(mention_ratio, 2),
            "bot_ratio": round(bot_ratio, 2),
            "breakdown": {
                "keywords": round(keyword_points, 1),
                "repetition": round(repetition_points, 1),
                "links": round(link_points, 1),
                "forwards": round(forward_points, 1),
                "mentions": round(mention_points, 1)
            }
        }
        return final_score, details

    async def compute_llm_score(self, messages: List[Dict[str, Any]], rule_score: float) -> Tuple[float, str]:
        """
        Uses Gemini to determine if the message samples are spammy.
        Returns a tuple of (final_score, reason).
        """
        if not self.gemini_enabled:
            return rule_score, "Gemini API key not configured. Using rule-based score."
            
        # Select message texts to send
        sample_texts = []
        for m in messages[:40]: # Send up to 40 messages to stay within prompt efficiency
            text = m.get("text", "").strip()
            if text:
                # Truncate long messages to prevent token bloat
                sample_texts.append(f"- {text[:150]}")
                
        if not sample_texts:
            return rule_score, "No message content available for LLM analysis."
            
        messages_block = "\n".join(sample_texts)
        
        prompt = f"""
Analyze the following list of recent messages from a Telegram group/channel. Determine if the group/channel is primarily a spam-heavy chat (e.g., cryptocurrency pump-and-dump schemes, casino spam, fake giveaways, airdrop bots, NSFW advertisements, or repetitive promotional messages).

Respond with a JSON object containing:
- "is_spam": true/false
- "confidence_score": integer between 0 and 100
- "reason": "Brief explanation of why it is or is not spam"

Ensure the output is strictly valid JSON only. Do not include markdown formatting or backticks around the JSON.

Messages:
{messages_block}
"""
        try:
            # We use gemini-2.5-flash as default, or fall back to gemini-1.5-flash if needed
            model = genai.GenerativeModel("gemini-2.5-flash")
            response = await asyncio.to_thread(model.generate_content, prompt)
            
            # Clean response text in case it wraps it in markdown backticks
            cleaned_response = response.text.strip()
            if cleaned_response.startswith("```json"):
                cleaned_response = cleaned_response[7:]
            if cleaned_response.startswith("```"):
                cleaned_response = cleaned_response[3:]
            if cleaned_response.endswith("```"):
                cleaned_response = cleaned_response[:-3]
            cleaned_response = cleaned_response.strip()
            
            result = json.loads(cleaned_response)
            
            is_spam = bool(result.get("is_spam", False))
            confidence = float(result.get("confidence_score", 50))
            reason = str(result.get("reason", "No reason provided by AI"))
            
            # Interpolate score based on LLM response
            # If AI is confident it's spam, we scale score towards 100.
            # If AI is confident it's clean, we scale score towards 0.
            if is_spam:
                llm_score = max(rule_score, confidence)
            else:
                llm_score = min(rule_score, 100.0 - confidence)
                
            return llm_score, f"[Gemini Decision: is_spam={is_spam}, confidence={confidence}%] {reason}"
            
        except Exception as e:
            logger.error(f"Error calling Gemini API: {e}")
            return rule_score, f"Gemini API failure ({e}). Using rule-based score."

    async def analyze_spam_score(self, messages: List[Dict[str, Any]]) -> Tuple[float, str, Dict[str, Any]]:
        """
        Analyzes messages and returns (spam_score, reason, extra_details).
        """
        rule_score, details = self.compute_rule_score(messages)
        
        # Decide if we need LLM fallback:
        # LLM fallback triggers if the score is borderline (50 to 75) and Gemini is configured.
        # This conserves API token usage and makes the scans faster and cheaper.
        if self.gemini_enabled and 50.0 <= rule_score <= 75.0:
            logger.info(f"Rule-based score is borderline ({rule_score}). Triggering Gemini LLM fallback...")
            llm_score, llm_reason = await self.compute_llm_score(messages, rule_score)
            details["llm_triggered"] = True
            details["original_rule_score"] = rule_score
            return llm_score, llm_reason, details
            
        # Determine rule-based reason
        reasons = []
        if details.get("breakdown", {}).get("keywords", 0) > 15:
            reasons.append("high keyword match density")
        if details.get("breakdown", {}).get("repetition", 0) > 12:
            reasons.append("highly repetitive message texts")
        if details.get("breakdown", {}).get("links", 0) > 10:
            reasons.append("high link density")
        if details.get("breakdown", {}).get("forwards", 0) > 5:
            reasons.append("high ratio of forwarded messages")
            
        reason_str = "Clean / normal activity."
        if rule_score >= 50.0:
            reason_str = "Spam indicators detected: " + ", ".join(reasons) if reasons else "Borderline spam indicators."
        elif rule_score >= 30.0:
            reason_str = "Mild spam indicators: " + ", ".join(reasons) if reasons else "Low level spam indicators."
            
        details["llm_triggered"] = False
        return rule_score, reason_str, details
import asyncio # needed for to_thread
