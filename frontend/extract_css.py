import re
with open('../gsap-demo.html', 'r', encoding='utf-8') as f:
    html = f.read()
match = re.search(r'<style>(.*?)</style>', html, re.DOTALL)
if match:
    css = match.group(1)
    with open('app/globals.css', 'w', encoding='utf-8') as f:
        f.write('@import "tailwindcss";\n' + css)
    print("CSS extracted successfully")
else:
    print("Could not find <style> block")
