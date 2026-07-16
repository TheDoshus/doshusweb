import os
import re

ZEPHYY_CSS = "public/css/zephyy.css"
CHAT_CSS = "public/css/zephyy-chat.css"

with open(ZEPHYY_CSS, "r") as f:
    z_css = f.read()

# Block to extract 1: from /* Chat icon glyph to the end of the prefers-reduced-motion block for the chat orb polish
start_idx = z_css.find("/* Chat icon glyph — hidden until voice/audio feature is wired */")
end_marker = "}\n\n\n/* -- App-feel selection"
end_idx = z_css.find(end_marker)

if start_idx == -1 or end_idx == -1:
    print("Failed to find main polish block")
    exit(1)

polish_block = z_css[start_idx:end_idx]
z_css = z_css[:start_idx] + z_css[end_idx:]

# Block 2: #zp-chat-send from micro-interaction springs
# Remove #zp-chat-send from the list
z_css = z_css.replace(".zp-sub-links a, .zp-sidebar-link, .footer-nav a, #zp-chat-send {", ".zp-sub-links a, .zp-sidebar-link, .footer-nav a {")
z_css = z_css.replace("  #zp-chat-send:active { transform: scale(0.9); }\n", "")

# Block 3: .zp-chat-msg animation
msg_start = z_css.find("/* Chat: each message eases in as it lands */")
msg_end_marker = "  }\n}\n"
msg_end = z_css.find(msg_end_marker, msg_start) + len("  }\n")

msg_block = z_css[msg_start:msg_end]
z_css = z_css[:msg_start] + z_css[msg_end:]

with open(ZEPHYY_CSS, "w") as f:
    f.write(z_css.strip() + "\n")

# Now append to zephyy-chat.css
with open(CHAT_CSS, "r") as f:
    c_css = f.read()

append_str = f"""
{polish_block}

@media (prefers-reduced-motion: no-preference) {{
  #zp-chat-send {{
    transition: transform 0.16s cubic-bezier(0.34, 1.6, 0.4, 1);
  }}
  #zp-chat-send:active {{
    transform: scale(0.9);
  }}

  {msg_block}
}}
"""

with open(CHAT_CSS, "a") as f:
    f.write(append_str)

print("CSS moved.")

# Now bump v1->v2 for chat css and v8->v9 for zephyy css
SITEWIDE_PAGES = [
    "public/index.html",
    "public/nexus.html",
    "public/thelounge.html",
    "public/financehub.html",
    "public/404.html"
]

ZEPHYY_PAGES = [
    "public/zephyy.html",
    "public/zephyy/crew/index.html",
    "public/zephyy/changelog/index.html",
    "public/zephyy/qa/index.html",
    "public/zephyy/status/index.html"
]

for page in SITEWIDE_PAGES + ZEPHYY_PAGES:
    with open(page, "r") as f:
        content = f.read()
    
    # Bump zephyy-chat.css?v=1 to v=2
    content = re.sub(r'href="([^"]*?)zephyy-chat\.css\?v=1"', r'href="\1zephyy-chat.css?v=2"', content)
    
    if page in ZEPHYY_PAGES:
        # Bump zephyy.css?v=8 to v=9
        content = re.sub(r'href="([^"]*?)zephyy\.css\?v=8"', r'href="\1zephyy.css?v=9"', content)
        
    with open(page, "w") as f:
        f.write(content)
        
print("HTML updated.")
