import os
import glob

files = glob.glob('admin/*.html') + glob.glob('public/*.html')

for f in files:
    with open(f, 'r', encoding='utf-8') as file:
        content = file.read()
    
    content = content.replace('Â© 2026 Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ø¹ÙŠØ§Ø¯Ø©. Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø­Ù‚ÙˆÙ‚ Ù…Ø­Ù ÙˆØ¸Ø©.', '© 2026 إدارة العيادة. جميع الحقوق محفوظة.')
    content = content.replace('`r`n  <script src="../js/common.js"></script>', '\n  <script src="../js/common.js"></script>')
    
    with open(f, 'w', encoding='utf-8') as file:
        file.write(content)
        
print("Fixed encoding.")
