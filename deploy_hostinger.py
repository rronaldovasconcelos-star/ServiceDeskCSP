"""
Deploy do FRONTEND para o Hostinger (servicedeskcsp.com.br) via API
===================================================================

ATENÇÃO: o site servicedeskcsp.com.br vive na HOSPEDAGEM Hostinger
(LiteSpeed/hPanel), NÃO no VPS Docker. O antigo update.py publica no VPS
(2.24.115.74) e NÃO atualiza o site — use ESTE script para o frontend.

O que faz:
  1. roda `npm run build` no frontend/ (gera dist/);
  2. zipa o CONTEÚDO de dist/ (arquivos na raiz do zip, inclui .htaccess);
  3. envia o zip à API do Hostinger (upload TUS) e dispara o deploy, que
     extrai os arquivos no public_html — substituindo o site.

Credenciais (em .deploy.env, NÃO versionado):
    HOSTINGER_API_TOKEN=<token da API do Hostinger>
    # opcional: HOSTINGER_DOMAIN=servicedeskcsp.com.br

Uso:
    python deploy_hostinger.py            # build + deploy
    python deploy_hostinger.py --no-build # zipa o dist/ atual e publica
"""
import io
import os
import sys
import json
import time
import zipfile
import subprocess
import urllib.request
import urllib.error

PROJECT = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.getcwd()
FRONTEND = os.path.join(PROJECT, "frontend")
DIST = os.path.join(FRONTEND, "dist")
BASE = "https://developers.hostinger.com"
UA = "csp-deploy-hostinger/1.0"


def _load_deploy_env():
    path = os.path.join(PROJECT, ".deploy.env")
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())


_load_deploy_env()

TOKEN = os.environ.get("HOSTINGER_API_TOKEN") or os.environ.get("API_TOKEN")
DOMAIN = os.environ.get("HOSTINGER_DOMAIN", "servicedeskcsp.com.br")
if not TOKEN:
    sys.exit("ERRO: HOSTINGER_API_TOKEN ausente no .deploy.env (token da API do Hostinger).")

# Client ID do login com Google. Vai embutido no bundle no momento do build; sem ele o
# botao "Entrar com Google" some do site (aconteceu em 23/09/2026 num build feito num PC
# sem o frontend/.env.production). Vem do .deploy.env (VITE_GOOGLE_CLIENT_ID) ou de um
# frontend/.env.production; sem nenhum dos dois o build e recusado.
def _google_client_id_do_env_production():
    p = os.path.join(FRONTEND, ".env.production")
    if not os.path.isfile(p):
        return ""
    for line in open(p, encoding="utf-8"):
        line = line.strip()
        if line.startswith("VITE_GOOGLE_CLIENT_ID="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    return ""

GOOGLE_CLIENT_ID = os.environ.get("VITE_GOOGLE_CLIENT_ID") or _google_client_id_do_env_production()
if not GOOGLE_CLIENT_ID:
    sys.exit("ERRO: VITE_GOOGLE_CLIENT_ID ausente. Coloque no .deploy.env (ou em frontend/.env.production); sem ele o login com Google some do site.")

# URL da API, tambem embutida no build. O .htaccess da Hostinger NAO encaminha /api ao
# backend, entao o build de producao precisa da URL absoluta do VPS. Um build com o
# padrao "/api" deixa o site inteiro sem API (aconteceu em 23/09/2026).
API_URL = os.environ.get("VITE_API_URL", "https://api.servicedeskcsp.com.br/api")
if not API_URL.startswith("https://"):
    sys.exit(f"ERRO: VITE_API_URL precisa ser a URL absoluta do backend (https://...), recebido: {API_URL!r}")


def api(path, data=None, method=None, extra_headers=None, raw=False):
    """Chamada JSON à API do Hostinger (Bearer token)."""
    url = path if path.startswith("http") else f"{BASE}/{path}"
    body = json.dumps(data).encode() if (data is not None and not raw) else data
    req = urllib.request.Request(url, data=body, method=method or ("POST" if data is not None else "GET"))
    req.add_header("Accept", "application/json")
    req.add_header("User-Agent", UA)
    req.add_header("Authorization", "Bearer " + TOKEN)
    if data is not None and not raw:
        req.add_header("Content-Type", "application/json")
    for k, v in (extra_headers or {}).items():
        req.add_header(k, v)
    try:
        r = urllib.request.urlopen(req, timeout=120)
        return r.status, dict(r.headers), r.read()
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read()


def build():
    print("Buildando o frontend (npm run build)...")
    npm = "npm.cmd" if os.name == "nt" else "npm"
    env = dict(os.environ, VITE_GOOGLE_CLIENT_ID=GOOGLE_CLIENT_ID, VITE_API_URL=API_URL)
    print(f"  VITE_API_URL = {API_URL}")
    print(f"  VITE_GOOGLE_CLIENT_ID = {GOOGLE_CLIENT_ID[:12]}...")
    if subprocess.run([npm, "run", "build"], cwd=FRONTEND, env=env).returncode != 0:
        sys.exit("ERRO: o build do frontend falhou.")


def make_zip():
    """Zipa o conteúdo de dist/ com os arquivos na RAIZ do archive (inclui ocultos)."""
    if not os.path.isdir(DIST):
        sys.exit(f"ERRO: pasta de build nao encontrada: {DIST}")
    ts = time.strftime("%Y%m%d_%H%M%S")
    archive = os.path.join(os.environ.get("TEMP", "/tmp"), f"servicedeskcsp_{ts}.zip")
    n = 0
    with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as z:
        for root, _dirs, files in os.walk(DIST):
            for f in files:
                full = os.path.join(root, f)
                arc = os.path.relpath(full, DIST).replace("\\", "/")
                z.write(full, arc)
                n += 1
    print(f"  zip criado: {archive} ({n} arquivos, {os.path.getsize(archive)//1024} KB)")
    return archive


def resolve_username():
    s, _h, b = api(f"api/hosting/v1/websites?domain={DOMAIN}")
    if s != 200:
        sys.exit(f"ERRO ao resolver username ({s}): {b[:300]}")
    return json.loads(b)["data"][0]["username"]


def tus_upload(username, archive):
    """Sobe o zip via protocolo TUS para o storage do Hostinger."""
    s, _h, b = api("api/hosting/v1/files/upload-urls", {"username": username, "domain": DOMAIN})
    if s != 200:
        sys.exit(f"ERRO ao obter credenciais de upload ({s}): {b[:300]}")
    cred = json.loads(b)
    up_url, x_auth, x_auth_rest = cred["url"], cred["auth_key"], cred["rest_auth_key"]
    filename = os.path.basename(archive)
    target = f"{up_url.rstrip('/')}/{filename}?override=true"
    size = os.path.getsize(archive)
    common = {"X-Auth": x_auth, "X-Auth-Rest": x_auth_rest}

    # 1) cria o upload (vazio) — espera 201
    s, _h, b = api(target, data=b"", raw=True, method="POST",
                   extra_headers={**common, "upload-length": str(size), "upload-offset": "0"})
    if s != 201:
        sys.exit(f"ERRO na criacao do upload ({s}): {b[:300]}")

    # 2) envia os bytes via PATCH (offset+octet-stream) — espera 204
    with open(archive, "rb") as fh:
        payload = fh.read()
    s, h, b = api(target, data=payload, raw=True, method="PATCH",
                  extra_headers={**common, "Tus-Resumable": "1.0.0", "Upload-Offset": "0",
                                 "Content-Type": "application/offset+octet-stream"})
    if s not in (200, 204):
        sys.exit(f"ERRO no envio dos bytes ({s}): {b[:300]}")
    print(f"  upload concluido ({size//1024} KB).")
    return filename


def trigger_deploy(username, filename):
    s, _h, b = api(f"api/hosting/v1/accounts/{username}/websites/{DOMAIN}/deploy",
                   {"archive_path": filename})
    if s != 200:
        sys.exit(f"ERRO ao disparar o deploy ({s}): {b[:300]}")
    print("  deploy disparado.")


def main():
    if "--no-build" not in sys.argv:
        build()
    archive = make_zip()
    print(f"Publicando em {DOMAIN} via API do Hostinger...")
    username = resolve_username()
    filename = tus_upload(username, archive)
    trigger_deploy(username, filename)
    try:
        os.remove(archive)
    except OSError:
        pass
    print("\nDeploy concluido! https://servicedeskcsp.com.br")
    print("Confira com cache-bust: https://servicedeskcsp.com.br/base/?cb=1")


if __name__ == "__main__":
    main()
