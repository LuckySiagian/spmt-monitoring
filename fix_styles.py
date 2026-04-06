import os

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Replaces explicitly light colors with CSS variables
    replacements = {
        "'rgba(255,255,255,0.75)'": "'var(--bg-card)'",
        "'rgba(255,255,255,0.82)'": "'var(--bg-card)'",
        "'rgba(241,245,249,0.9)'": "'var(--bg-card)'",
        "'rgba(255,255,255,0.9)'": "'var(--bg-header)'",
        "'rgba(241,245,249,0.95)'": "'var(--bg-header)'",
        "'#1e293b'": "'var(--text)'",
        "'#475569'": "'var(--text-sub)'",
        "'#94a3b8'": "'var(--text-muted)'",
        "'#1e2d4a'": "'var(--border)'",
        "'rgba(99,102,241,0.12)'": "'var(--border)'",
        "'rgba(99,102,241,0.10)'": "'var(--border)'",
        "'rgba(99,102,241,0.07)'": "'var(--border)'",
        "'#0f1629'": "'var(--bg-main)'",
        "'#111827'": "'var(--bg-main)'",
        "'#ffffff'": "'var(--text)'",
        "'#fff'": "'var(--text)'",
        "boxShadow: '0 2px 16px rgba(99,102,241,0.10)'": "boxShadow: 'var(--shadow)'",
        "boxShadow: '0 20px 60px rgba(0,0,0,0.5)'": "boxShadow: 'var(--shadow)'",
        "color: '#64748b'": "color: 'var(--text-sub)'",
        "background: '#f8fafc'": "background: 'var(--bg-main)'",
        "color: '#000'": "color: 'var(--text)'",
        "background: '#fff'": "background: 'var(--bg-card)'",
        "background: 'white'": "background: 'var(--bg-card)'",
        "'#f8fafc'": "'var(--text)'"
    }

    new_content = content
    for old, new in replacements.items():
        new_content = new_content.replace(old, new)

    if new_content != content:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(new_content)
        print(f"Updated {filepath}")

for root, _, files in os.walk('frontend/src'):
    for file in files:
        if file.endswith('.jsx'):
            process_file(os.path.join(root, file))
print('Done processing JSX files.')
