// Supabase Configuration for LinkedIn Sales Agent
const supabaseConfig = {
  url: "https://voyysvyfcjdhjtjbbeym.supabase.co",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZveXlzdnlmY2pkaGp0amJiZXltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE0MjY4NzQsImV4cCI6MjA3NzAwMjg3NH0.KM4yOGzoOMfx75CjIIN2EMGF1WOj359QS4Wac3jYUlc",
};

// Export for use in other files
if (typeof module !== "undefined" && module.exports) {
  module.exports = supabaseConfig;
} else {
  window.supabaseConfig = supabaseConfig;
}

