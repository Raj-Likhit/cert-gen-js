import base64
with open('sample_template.png', 'rb') as f:
    b64 = base64.b64encode(f.read()).decode('utf-8')
js = f"""
const b64 = "data:image/png;base64,{b64}";
const cfg = {{
    templateBase64: b64,
    nameX: 500,
    nameY: 300,
    fontSize: 50,
    fontFamily: 'Arial, sans-serif',
    fontBold: true,
    fontItalic: false,
    fontColor: '#FF5555',
    strokeWidth: 2,
    strokeColor: '#FFFFFF',
    participants: ['John Doe', 'Raj Likhit']
}};
localStorage.setItem('certConfig', JSON.stringify(cfg));
sessionStorage.setItem('adminAuth', 'true');
location.reload();
"""
with open('inject.js', 'w') as f:
    f.write(js)
