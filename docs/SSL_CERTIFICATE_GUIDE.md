# 🔒 GUIA: RESOLVER "NÃO SEGURO" E ERRO 400

**Problema:** Certificados SSL auto-assinados  
**Data:** 9 de setembro de 2026, 23:44 UTC  
**Status:** ✅ Normal para ambiente local

---

## ⚠️ **O QUE ESTÁ ACONTECENDO**

### **1. "Não Seguro" em vermelho:**
- ✅ **É NORMAL!** 
- O CatDex usa certificados SSL **auto-assinados** (gerados localmente)
- Navegadores não confiam automaticamente em certificados auto-assinados
- **É SEGURO para uso local** - seus dados não saem do seu computador

### **2. Erro "400 Bad Request":**
- Você tentou acessar com `http://` (sem S)
- O CatDex só aceita `https://` (com S)

---

## ✅ **SOLUÇÃO RÁPIDA (3 PASSOS)**

### **PASSO 1: Aceitar certificado do BACKEND**

1. Abra uma nova aba no navegador
2. Acesse: `https://localhost:8000/health`
3. Você verá um aviso de segurança
4. Clique em **"Avançado"** ou **"Advanced"**
5. Clique em **"Ir para localhost (não seguro)"** ou **"Proceed to localhost"**
6. Você verá: `{"status":"ok"}`
7. ✅ Certificado do backend aceito!

### **PASSO 2: Aceitar certificado do FRONTEND**

1. Abra uma nova aba
2. Acesse: `https://localhost:5173` (com **https** e S)
3. Você verá o mesmo aviso de segurança
4. Clique em **"Avançado"** ou **"Advanced"**
5. Clique em **"Ir para localhost (não seguro)"** ou **"Proceed to localhost"**
6. ✅ CatDex vai abrir!

### **PASSO 3: Fazer Login**

```
MASTER_API_KEY=STJ0lGFg6BMpFKw49AS1dwI2ueg9gfao2XpoMb5gNOg
```

---

## 🌐 **GUIA POR NAVEGADOR**

### **Google Chrome / Brave / Edge:**

#### **No aviso de segurança:**
```
1. Você verá: "Sua conexão não é particular"
2. Clique em: "Avançado" (no canto inferior esquerdo)
3. Clique em: "Ir para localhost (não seguro)"
4. Pronto!
```

#### **Atalho rápido:**
- Na tela de aviso, digite: `thisisunsafe` (sem espaços)
- O site abre automaticamente!

---

### **Firefox:**

#### **No aviso de segurança:**
```
1. Você verá: "Aviso: risco potencial de segurança"
2. Clique em: "Avançado"
3. Clique em: "Aceitar o Risco e Continuar"
4. Pronto!
```

---

### **Safari:**

#### **No aviso de segurança:**
```
1. Você verá: "Esta conexão não é privada"
2. Clique em: "Mostrar Detalhes"
3. Clique em: "visitar este website"
4. Digite a senha do macOS (se pedido)
5. Pronto!
```

---

## 🛠️ **COMANDOS PARA VERIFICAR**

### **1. Verificar se os containers estão rodando:**
```bash
docker ps
```

**Resultado esperado:**
```
catdex-frontend-1   Up X minutes   127.0.0.1:5173->5173/tcp
catdex-backend-1    Up X minutes   127.0.0.1:8000->8000/tcp (healthy)
```

### **2. Testar o backend via terminal:**
```bash
curl -k https://localhost:8000/health
```

**Resultado esperado:**
```json
{"status":"ok"}
```

### **3. Ver logs do frontend:**
```bash
docker logs catdex-frontend-1 --tail 20
```

### **4. Ver logs do backend:**
```bash
docker logs catdex-backend-1 --tail 20
```

---

## ❌ **ERROS COMUNS E SOLUÇÕES**

### **Erro 1: "400 Bad Request - The plain HTTP request was sent to HTTPS port"**

**Causa:** Você está usando `http://` em vez de `https://`

**Solução:**
```
❌ http://localhost:5173   (SEM o S - dá erro)
✅ https://localhost:5173  (COM o S - funciona)
```

---

### **Erro 2: "ERR_CERT_AUTHORITY_INVALID"**

**Causa:** Certificado auto-assinado não é confiável

**Solução:**
1. Aceitar o certificado manualmente (veja os passos acima)
2. Isso precisa ser feito **UMA VEZ** por navegador

---

### **Erro 3: "Não consegue conectar ao backend"**

**Causa:** Certificado do backend não foi aceito

**Solução:**
1. Abra `https://localhost:8000/health` em uma aba
2. Aceite o certificado
3. Volte para `https://localhost:5173`
4. Recarregue a página (F5)

---

### **Erro 4: Página em branco ou não carrega**

**Solução:**
```bash
# 1. Ver logs do frontend
docker logs catdex-frontend-1 --tail 30

# 2. Reiniciar containers
docker compose restart

# 3. Aguardar 10 segundos e tentar novamente
```

---

## 🔐 **POR QUE USAMOS HTTPS?**

### **Razões técnicas:**
1. ✅ **Cookies seguros** - HttpOnly cookies só funcionam em HTTPS
2. ✅ **APIs modernas** - Muitas APIs do navegador exigem HTTPS
3. ✅ **Boas práticas** - Ambiente de produção sempre usa HTTPS
4. ✅ **Criptografia** - Dados são criptografados entre frontend e backend

### **É seguro?**
- ✅ **SIM!** Tudo roda localmente no seu computador
- ✅ Seus dados **nunca saem** do localhost
- ✅ As chaves de API ficam **apenas no seu servidor**
- ⚠️ O aviso do navegador é **apenas porque o certificado é auto-assinado**

---

## 📝 **CHECKLIST DE ACESSO**

Siga esta ordem:

- [ ] **1.** Containers rodando? (`docker ps`)
- [ ] **2.** Abrir `https://localhost:8000/health` (aceitar certificado)
- [ ] **3.** Ver `{"status":"ok"}` na tela
- [ ] **4.** Abrir `https://localhost:5173` (aceitar certificado)
- [ ] **5.** Ver tela de login do CatDex
- [ ] **6.** Colar MASTER_API_KEY
- [ ] **7.** Clicar em "Entrar"
- [ ] **8.** Ver o dashboard do CatDex 🐱

---

## 🎯 **TESTE AGORA**

### **1. Backend:**
```
Abra: https://localhost:8000/health
Aceite o certificado
Veja: {"status":"ok"}
```

### **2. Frontend:**
```
Abra: https://localhost:5173
Aceite o certificado
Veja: Tela de login do CatDex
```

### **3. Login:**
```
Cole: STJ0lGFg6BMpFKw49AS1dwI2ueg9gfao2XpoMb5gNOg
Clique: Entrar
Veja: Dashboard com logo do gato 🐱
```

---

## 💡 **DICA PRO**

### **Chrome/Brave - Atalho secreto:**

Quando aparecer o aviso de segurança:
1. **NÃO clique em nada**
2. Digite no teclado: `thisisunsafe` (sem espaços)
3. A página abre automaticamente!

(Isso funciona porque é um atalho secreto do Chrome)

---

## ❓ **AINDA NÃO FUNCIONOU?**

### **Execute estes comandos:**

```bash
# 1. Verificar status
docker ps

# 2. Ver logs do frontend
docker logs catdex-frontend-1

# 3. Ver logs do backend
docker logs catdex-backend-1

# 4. Reiniciar tudo
docker compose restart

# 5. Aguardar 10 segundos
sleep 10

# 6. Testar backend
curl -k https://localhost:8000/health

# 7. Abrir navegador
open https://localhost:5173
```

---

## 🐱 **RESULTADO ESPERADO**

Depois de aceitar os certificados, você verá:

```
🔒 https://localhost:5173 (cadeado pode estar com aviso)

┌─────────────────────────────────┐
│  🐱 CATDEX                     │
│                                 │
│  [API Key input field]         │
│  [     ENTRAR     ]            │
│                                 │
│  🔐 Plataforma de Trading      │
│      Algorítmico                │
└─────────────────────────────────┘
```

---

## ✅ **RESUMO**

1. ✅ Aceitar certificado em `https://localhost:8000/health`
2. ✅ Aceitar certificado em `https://localhost:5173`
3. ✅ Usar **HTTPS** (com S), não HTTP
4. ✅ O aviso "não seguro" é **NORMAL** para certificados auto-assinados
5. ✅ É **SEGURO** usar localmente

---

**🐱 CatDex - Tudo rodando localmente e seguro!**

---

**Criado em:** 9 de setembro de 2026, 23:44 UTC  
**Válido para:** Chrome, Firefox, Safari, Brave, Edge  
**Ambiente:** macOS (localhost)
