"""
Deploy de atualizacao para servicedeskcsp.com.br
Uso: python update.py
"""
import tarfile, os, sys, paramiko

PROJECT = r"c:\Users\rrona\Desktop\ATENDIMENTO CSP"
ARCHIVE = r"c:\Users\rrona\AppData\Local\Temp\csp-deploy.tar.gz"

# Credenciais do deploy vêm de .deploy.env (NÃO versionado) ou de variáveis de
# ambiente. Nunca hardcode a senha do VPS aqui — vazaria no histórico do git.
def _load_deploy_env():
    base = os.path.dirname(os.path.abspath(__file__)) if "__file__" in globals() else os.getcwd()
    path = os.path.join(base, ".deploy.env")
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

VPS_IP   = os.environ.get("CSP_VPS_HOST", "2.24.115.74")
VPS_USER = os.environ.get("CSP_VPS_USER", "root")
VPS_PASS = os.environ.get("CSP_VPS_PASS")
if not VPS_PASS:
    sys.exit("ERRO: senha do VPS ausente. Crie .deploy.env (copie de .deploy.env.example) com CSP_VPS_PASS=...")

EXCLUDE_DIRS  = {"node_modules", ".git", "dist", "__pycache__"}
EXCLUDE_FILES = {"dev.db", "dev.db-shm", "dev.db-wal"}

def skip(rel):
    parts = rel.replace("\\", "/").split("/")
    if any(p in EXCLUDE_DIRS for p in parts): return True
    if parts[-1] in EXCLUDE_FILES: return True
    if parts[-1].startswith(".env") and parts[-1] not in (".env.production", ".env.example"): return True
    return False

print("Empacotando projeto...")
count = 0
with tarfile.open(ARCHIVE, "w:gz") as tar:
    for root, dirs, files in os.walk(PROJECT):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        for f in files:
            full = os.path.join(root, f)
            rel  = os.path.relpath(full, PROJECT)
            if not skip(rel):
                tar.add(full, arcname=rel)
                count += 1

size = os.path.getsize(ARCHIVE) / 1024
print(f"  {count} arquivos, {size:.0f} KB")

print("Enviando ao VPS...")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(VPS_IP, username=VPS_USER, password=VPS_PASS)

sftp = client.open_sftp()
sftp.put(ARCHIVE, "/root/csp-deploy.tar.gz")
sftp.close()
print("  Upload OK")

print("Aplicando no servidor...")
cmd = (
    "tar -xzf /root/csp-deploy.tar.gz -C /root/servicedeskcsp --overwrite && "
    "cd /root/servicedeskcsp && "
    "cp .env.production .env && "
    "find . -name '*.sh' -exec sed -i 's/\\r//' {} \\; && "
    "docker compose up --build -d 2>&1"
)
_, out, _ = client.exec_command(cmd, timeout=300)

for line in out:
    text = line.rstrip() if isinstance(line, str) else line.decode("ascii", "replace").rstrip()
    if any(k in text for k in ["Built", "Started", "Running", "ERROR", "error", "WARN", "Step", ">>>"]):
        print(" ", text)

client.close()
print("\nDeploy concluido! https://servicedeskcsp.com.br")
