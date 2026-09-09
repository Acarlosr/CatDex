#!/usr/bin/env python3
"""
Gerador de Relatório de Auditoria de Segurança - ApexAlgo/CatDex
Gera PDF com achados, gráficos e issues prontas para GitHub
"""

import os
import sys
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak, Image
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.pdfgen import canvas
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from io import BytesIO

# Dados da auditoria
ACHADOS = [
    {
        "categoria": "IDOR",
        "severidade": "crítica",
        "arquivo": "backend/routers/trades.py",
        "linha": 198,
        "descricao": "DELETE /api/trades/positions/{position_id} não valida propriedade",
        "detalhe": "Qualquer usuário autenticado pode deletar posições de qualquer bot sem verificar ownership. A rota busca Position.id diretamente sem filtrar por tenant/user.",
        "impacto": "Perda de dados financeiros. Attacker pode apagar histórico de trades de outros bots.",
        "evidencia": "pos = db.query(Position).filter(Position.id == position_id).first()\ndb.delete(pos)"
    },
    {
        "categoria": "IDOR",
        "severidade": "crítica",
        "arquivo": "backend/routers/trades.py",
        "linha": 401,
        "descricao": "POST /api/trades/positions/{position_id}/close não valida propriedade",
        "detalhe": "Qualquer usuário pode forçar fechamento de posição alheia (incluindo live orders na exchange real).",
        "impacto": "Manipulação de trades reais. Attacker pode fechar posições live de outros usuários, causando perdas financeiras diretas.",
        "evidencia": "pos = db.query(Position).filter(Position.id == position_id).first()\nif not pos:\n    return JSONResponse(status_code=404, ...)"
    },
    {
        "categoria": "IDOR",
        "severidade": "crítica",
        "arquivo": "backend/routers/bots.py",
        "linha": 236,
        "descricao": "PUT /api/bots/{bot_id} permite editar bot alheio",
        "detalhe": "Não há validação de ownership. Qualquer usuário autenticado pode modificar estratégias, API keys vinculadas e configurações de risco de qualquer bot.",
        "impacto": "Takeover de bots. Attacker pode reconfigurar bots alheios para usar suas próprias exchange keys ou modificar estratégias para gerar perdas.",
        "evidencia": "bot = db.query(BotConfig).filter(BotConfig.id == bot_id).first()\nif not bot:\n    raise HTTPException(status_code=404, ...)"
    },
    {
        "categoria": "IDOR",
        "severidade": "crítica",
        "arquivo": "backend/routers/bots.py",
        "linha": 332,
        "descricao": "DELETE /api/bots/{bot_id} pode deletar bot alheio",
        "detalhe": "Sem validação de ownership. Deleta bot e fecha todas posições abertas (incluindo live).",
        "impacto": "Destruição de configurações e fechamento forçado de posições reais de outros usuários.",
        "evidencia": "bot = db.query(BotConfig).filter(BotConfig.id == bot_id).first()\nif not bot:\n    raise HTTPException(status_code=404, ...)"
    },
    {
        "categoria": "IDOR",
        "severidade": "alta",
        "arquivo": "backend/routers/keys.py",
        "linha": 168,
        "descricao": "GET /api/keys/{key_name}/balance expõe saldo de API key alheia",
        "detalhe": "Qualquer usuário pode consultar saldo da carteira de qualquer API key cadastrada no sistema.",
        "impacto": "Vazamento de informações financeiras sensíveis (saldos, holdings) de outros usuários.",
        "evidencia": "key_record = db.query(ExchangeKey).filter(ExchangeKey.name == key_name).first()\nif not key_record:\n    raise HTTPException(status_code=404, ...)"
    },
    {
        "categoria": "IDOR",
        "severidade": "crítica",
        "arquivo": "backend/routers/keys.py",
        "linha": 233,
        "descricao": "DELETE /api/keys/{key_name} pode deletar chave de API alheia",
        "detalhe": "Sem validação de ownership. Attacker pode remover API keys de exchanges de outros usuários.",
        "impacto": "Perda de acesso às exchanges. Bots param de funcionar, histórico de configuração perdido.",
        "evidencia": "key_record = db.query(ExchangeKey).filter(ExchangeKey.name == key_name).first()\ndb.delete(key_record)"
    },
    {
        "categoria": "IDOR",
        "severidade": "crítica",
        "arquivo": "backend/routers/keys.py",
        "linha": 243,
        "descricao": "POST /api/keys/{name}/swap executa swap em carteira alheia",
        "detalhe": "Qualquer usuário pode executar market orders (swaps) usando API keys de outros usuários.",
        "impacto": "Perdas financeiras diretas. Attacker pode drenar saldos executando swaps desfavoráveis ou movimentando ativos para pares ilíquidos.",
        "evidencia": "key_record = db.query(ExchangeKey).filter(ExchangeKey.name == name).first()\nexchange = build_exchange_from_key(key_record)\norder = exchange.create_market_buy_order(...)"
    },
    {
        "categoria": "IDOR",
        "severidade": "alta",
        "arquivo": "backend/routers/bots.py",
        "linha": 520,
        "descricao": "DELETE /api/bots/{bot_name}/cache limpa cache de bot alheio",
        "detalhe": "Qualquer usuário pode limpar sinais, logs e trades simulados de qualquer bot via bot_name (string).",
        "impacto": "Perda de dados históricos de backtest e sinais. Pode forçar re-execução de backtest custoso.",
        "evidencia": "bot = db.query(BotConfig).filter(BotConfig.name == bot_name).first()\nresult = db.execute(text('DELETE FROM signals WHERE bot_name = :bn'), {'bn': bot_name})"
    },
    {
        "categoria": "IDOR",
        "severidade": "média",
        "arquivo": "backend/routers/trades.py",
        "linha": 216,
        "descricao": "POST /api/trades/positions/bulk-delete permite deleção em massa sem validação",
        "detalhe": "Aceita lista de IDs e deleta todas posições sem verificar ownership de cada uma.",
        "impacto": "Perda massiva de histórico de trades. Um único request pode apagar centenas de posições de múltiplos usuários.",
        "evidencia": "def bulk_delete_positions(ids: list[int] = Body(...), db: Session = Depends(get_db)):\n    db.query(Position).filter(Position.id.in_(ids)).delete(...)"
    },
    {
        "categoria": "Banco sem Tranca",
        "severidade": "crítica",
        "arquivo": "backend/routers/trades.py",
        "linha": 56,
        "descricao": "GET /api/trades/positions não filtra por tenant/usuário",
        "detalhe": "A aplicação não possui mecanismo de multi-tenancy. Todas as queries retornam dados de todos os usuários (se houvesse mais de um).",
        "impacto": "Não há isolamento de dados. Sistema single-user de fato, mas arquitetura permite criação de múltiplos bots/keys sem isolamento.",
        "evidencia": "query = db.query(Position.id, Position.exchange, Position.bot_name, ...)\nif symbol: query = query.filter(Position.symbol == formatted_symbol)"
    },
    {
        "categoria": "Banco sem Tranca",
        "severidade": "crítica",
        "arquivo": "backend/routers/bots.py",
        "linha": 62,
        "descricao": "GET /api/bots/ lista todos os bots sem filtro de ownership",
        "detalhe": "Não existe coluna user_id ou tenant_id nas tabelas. Sistema é single-tenant de fato.",
        "impacto": "Qualquer usuário vê todos os bots do sistema. Se fosse multi-user, seria vazamento total.",
        "evidencia": "def get_all_bots(db: Session = Depends(get_db)):\n    return db.query(BotConfig).all()"
    },
    {
        "categoria": "Banco sem Tranca",
        "severidade": "crítica",
        "arquivo": "backend/routers/keys.py",
        "linha": 131,
        "descricao": "GET /api/keys lista todas API keys sem filtro de usuário",
        "detalhe": "Todas as chaves de exchange cadastradas no sistema são visíveis para qualquer usuário autenticado.",
        "impacto": "Vazamento de informações sensíveis: nomes de keys, exchanges usadas, status de conexão, bots vinculados.",
        "evidencia": "def get_exchange_keys_status(db: Session = Depends(get_db)):\n    keys = db.query(ExchangeKey).all()"
    }
]

# Mecanismo de isolamento detectado
MECANISMO_ISOLAMENTO = """
O projeto ApexAlgo NÃO possui mecanismo de isolamento multi-tenant. A aplicação é 
single-user por design: há apenas uma MASTER_API_KEY global que dá acesso total ao 
sistema. Não existem colunas user_id, tenant_id ou workspace_id em nenhuma tabela.

Todas as queries buscam dados de todos os bots, positions, orders e exchange_keys sem 
filtro de ownership. O sistema foi projetado para uso pessoal (self-hosted), onde o 
único usuário é o dono da instância.

Porém, a arquitetura permite criar múltiplos bots e múltiplas API keys, o que sugere 
que futuramente poderia ser multi-user - mas nesse caso, TODOS os endpoints precisariam 
ser refatorados para adicionar filtros de tenant.
"""

PONTOS_FORTES = [
    "Autenticação obrigatória: 43 de 47 endpoints protegidos com verify_api_key",
    "Criptografia de credenciais: API keys de exchanges criptografadas em repouso com Fernet",
    "Timing-safe comparison: HMAC usado para validar session cookies e API keys",
    "Rate limiting: Throttling de tentativas de autenticação falhadas (10 por minuto por IP)",
    "Secrets gerenciados: .env gerado automaticamente em primeiro boot, nunca commitado",
    "Permissões de arquivo: .env criado com chmod 600, não legível por outros usuários",
    "Histórico git limpo: Nenhum segredo encontrado commitado no histórico do repositório",
    "Sem XSS direto: Nenhum uso de innerHTML, dangerouslySetInnerHTML ou eval encontrado no frontend",
    "Sem hardcoded secrets: Nenhuma API key ou senha embutida no código-fonte",
    "SQLite WAL mode: Write-Ahead Logging evita locks de escrita/leitura"
]

def create_donut_chart():
    """Gráfico de rosca: severidade dos achados"""
    severities = [a['severidade'] for a in ACHADOS]
    counts = {
        'crítica': severities.count('crítica'),
        'alta': severities.count('alta'),
        'média': severities.count('média')
    }
    
    labels = [f"{k.title()}\n({v})" for k, v in counts.items() if v > 0]
    values = [v for v in counts.values() if v > 0]
    colors_map = ['#B91C1C', '#EA580C', '#D97706']
    
    fig, ax = plt.subplots(figsize=(5, 5))
    wedges, texts, autotexts = ax.pie(
        values, labels=labels, colors=colors_map,
        autopct='%1.0f%%', startangle=90,
        wedgeprops=dict(width=0.5, edgecolor='white')
    )
    for text in texts:
        text.set_fontsize(11)
        text.set_weight('bold')
    for autotext in autotexts:
        autotext.set_color('white')
        autotext.set_fontsize(12)
        autotext.set_weight('bold')
    
    ax.set_title('Distribuição por Severidade', fontsize=13, weight='bold', pad=20)
    
    buf = BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight', facecolor='white')
    buf.seek(0)
    plt.close()
    return buf

def create_bar_chart():
    """Gráfico de barras: achados por categoria"""
    categories = [a['categoria'] for a in ACHADOS]
    cat_counts = {}
    for cat in categories:
        cat_counts[cat] = cat_counts.get(cat, 0) + 1
    
    labels = list(cat_counts.keys())
    values = list(cat_counts.values())
    
    fig, ax = plt.subplots(figsize=(7, 4))
    bars = ax.barh(labels, values, color='#2563EB', edgecolor='white', linewidth=1.5)
    
    for bar in bars:
        width = bar.get_width()
        ax.text(width + 0.2, bar.get_y() + bar.get_height()/2, 
                f'{int(width)}', ha='left', va='center', fontsize=11, weight='bold')
    
    ax.set_xlabel('Número de Achados', fontsize=11, weight='bold')
    ax.set_title('Achados por Categoria', fontsize=13, weight='bold', pad=15)
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.grid(axis='x', alpha=0.3, linestyle='--')
    
    buf = BytesIO()
    plt.savefig(buf, format='png', dpi=150, bbox_inches='tight', facecolor='white')
    buf.seek(0)
    plt.close()
    return buf

class NumberedCanvas(canvas.Canvas):
    """Canvas com cabeçalho e rodapé"""
    def __init__(self, *args, **kwargs):
        canvas.Canvas.__init__(self, *args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_page_decorations(self, page_count):
        self.saveState()
        self.setFont('Helvetica', 9)
        self.setFillColorRGB(0.5, 0.5, 0.5)
        
        # Cabeçalho
        if self.getPageNumber() > 1:
            self.drawString(2*cm, A4[1] - 1.5*cm, "Relatório de Auditoria de Segurança — ApexAlgo")
        
        # Rodapé
        self.drawRightString(A4[0] - 2*cm, 1*cm, f"Página {self.getPageNumber()} de {page_count}")
        self.drawString(2*cm, 1*cm, datetime.now().strftime("%d/%m/%Y"))
        
        self.restoreState()

def generate_pdf():
    """Gera o relatório completo em PDF"""
    output_path = "/Volumes/Curso/Catdex/docs/security-audit/relatorio-auditoria-seguranca.pdf"
    
    doc = SimpleDocTemplate(
        output_path,
        pagesize=A4,
        rightMargin=2*cm, leftMargin=2*cm,
        topMargin=2.5*cm, bottomMargin=2.5*cm
    )
    
    styles = getSampleStyleSheet()
    story = []
    
    # Estilos customizados
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Title'],
        fontSize=24,
        textColor=colors.HexColor('#1F2937'),
        spaceAfter=12,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    )
    
    subtitle_style = ParagraphStyle(
        'CustomSubtitle',
        parent=styles['Normal'],
        fontSize=11,
        textColor=colors.HexColor('#6B7280'),
        spaceAfter=30,
        alignment=TA_CENTER
    )
    
    heading1 = ParagraphStyle(
        'CustomHeading1',
        parent=styles['Heading1'],
        fontSize=16,
        textColor=colors.HexColor('#1F2937'),
        spaceAfter=12,
        spaceBefore=20,
        fontName='Helvetica-Bold'
    )
    
    heading2 = ParagraphStyle(
        'CustomHeading2',
        parent=styles['Heading2'],
        fontSize=13,
        textColor=colors.HexColor('#374151'),
        spaceAfter=10,
        spaceBefore=15,
        fontName='Helvetica-Bold'
    )
    
    body_style = ParagraphStyle(
        'CustomBody',
        parent=styles['Normal'],
        fontSize=10,
        textColor=colors.HexColor('#374151'),
        spaceAfter=8,
        leading=14
    )
    
    # ═══════════════════════════════════════════════════════
    # CAPA
    # ═══════════════════════════════════════════════════════
    story.append(Spacer(1, 3*cm))
    story.append(Paragraph("Relatório de Auditoria de Segurança", title_style))
    story.append(Paragraph("ApexAlgo (CatDex)", subtitle_style))
    story.append(Spacer(1, 1*cm))
    
    info_data = [
        ['Data da Auditoria:', datetime.now().strftime("%d de setembro de 2026")],
        ['Escopo:', 'Backend API + Frontend React + Deploy'],
        ['Metodologia:', 'Análise estática de código-fonte'],
        ['Total de Achados:', f"{len(ACHADOS)} vulnerabilidades identificadas"]
    ]
    info_table = Table(info_data, colWidths=[5*cm, 10*cm])
    info_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#374151')),
        ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
        ('ALIGN', (1, 0), (1, -1), 'LEFT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
    ]))
    story.append(info_table)
    
    story.append(Spacer(1, 2*cm))
    story.append(Paragraph("<b>Stack Detectada:</b>", body_style))
    stack_text = """
    • <b>Backend:</b> Python 3.11+ / FastAPI 0.135 / SQLAlchemy 2.0<br/>
    • <b>Banco de Dados:</b> SQLite 3 (WAL mode)<br/>
    • <b>ORM:</b> SQLAlchemy (sem Supabase, sem RLS)<br/>
    • <b>Autenticação:</b> API Key global (MASTER_API_KEY) + session cookie HMAC<br/>
    • <b>Frontend:</b> React 19 / Vite 8 / TailwindCSS 4<br/>
    • <b>Deploy:</b> Docker Compose / nginx proxy / self-signed SSL<br/>
    • <b>Criptografia:</b> Fernet (exchange API keys at rest)
    """
    story.append(Paragraph(stack_text, body_style))
    
    story.append(PageBreak())
    
    # ═══════════════════════════════════════════════════════
    # RESUMO EXECUTIVO
    # ═══════════════════════════════════════════════════════
    story.append(Paragraph("1. Resumo Executivo", heading1))
    
    summary_text = f"""
    Esta auditoria identificou <b>{len(ACHADOS)} vulnerabilidades de segurança</b> no projeto 
    ApexAlgo, sendo <b>{len([a for a in ACHADOS if a['severidade'] == 'crítica'])} críticas</b>.
    <br/><br/>
    <b>Principais Riscos:</b><br/>
    • <b>IDOR massivo:</b> 9 endpoints permitem acesso/modificação de recursos alheios<br/>
    • <b>Ausência de isolamento:</b> Sistema single-user sem tenant_id nas tabelas<br/>
    • <b>Manipulação de trades reais:</b> Atacante pode fechar posições live na exchange<br/>
    • <b>Acesso a API keys:</b> Qualquer usuário pode ver/deletar/usar chaves alheias
    <br/><br/>
    <b>Ponto crítico:</b> O sistema foi projetado para self-hosting single-user, mas a arquitetura 
    permite múltiplos bots e API keys sem isolamento. Qualquer usuário com a MASTER_API_KEY 
    tem acesso total a todos os recursos.
    """
    story.append(Paragraph(summary_text, body_style))
    story.append(Spacer(1, 0.5*cm))
    
    # Gráficos
    donut_buf = create_donut_chart()
    bar_buf = create_bar_chart()
    
    donut_img = Image(donut_buf, width=8*cm, height=8*cm)
    bar_img = Image(bar_buf, width=12*cm, height=7*cm)
    
    story.append(donut_img)
    story.append(Spacer(1, 0.5*cm))
    story.append(bar_img)
    
    story.append(PageBreak())
    
    # ═══════════════════════════════════════════════════════
    # MECANISMO DE ISOLAMENTO
    # ═══════════════════════════════════════════════════════
    story.append(Paragraph("2. Análise do Mecanismo de Isolamento", heading1))
    story.append(Paragraph(MECANISMO_ISOLAMENTO, body_style))
    
    story.append(PageBreak())
    
    # ═══════════════════════════════════════════════════════
    # PONTOS FORTES
    # ═══════════════════════════════════════════════════════
    story.append(Paragraph("3. Pontos Fortes", heading1))
    story.append(Paragraph("O sistema implementa várias boas práticas de segurança:", body_style))
    story.append(Spacer(1, 0.3*cm))
    
    for ponto in PONTOS_FORTES:
        story.append(Paragraph(f"✓ {ponto}", body_style))
    
    story.append(PageBreak())
    
    # ═══════════════════════════════════════════════════════
    # ACHADOS DETALHADOS
    # ═══════════════════════════════════════════════════════
    story.append(Paragraph("4. Achados Detalhados", heading1))
    
    # Agrupar por categoria
    by_category = {}
    for achado in ACHADOS:
        cat = achado['categoria']
        if cat not in by_category:
            by_category[cat] = []
        by_category[cat].append(achado)
    
    for categoria, achados_cat in by_category.items():
        story.append(Paragraph(f"4.{list(by_category.keys()).index(categoria) + 1}. {categoria}", heading2))
        
        for i, achado in enumerate(achados_cat, 1):
            # Chip de severidade
            sev_colors = {
                'crítica': '#B91C1C',
                'alta': '#EA580C',
                'média': '#D97706',
                'baixa': '#2563EB'
            }
            sev_color = sev_colors.get(achado['severidade'], '#6B7280')
            
            data = [
                ['Severidade', Paragraph(f"<b><font color='{sev_color}'>{achado['severidade'].upper()}</font></b>", body_style)],
                ['Arquivo', f"{achado['arquivo']}:{achado['linha']}"],
                ['Descrição', achado['descricao']],
                ['Detalhe', achado['detalhe']],
                ['Impacto', achado['impacto']],
                ['Evidência', Paragraph(f"<font face='Courier' size='8'>{achado['evidencia']}</font>", body_style)]
            ]
            
            table = Table(data, colWidths=[3*cm, 13*cm])
            table.setStyle(TableStyle([
                ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
                ('FONTSIZE', (0, 0), (-1, -1), 9),
                ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#374151')),
                ('ALIGN', (0, 0), (0, -1), 'RIGHT'),
                ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#F9FAFB')),
                ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E5E7EB')),
                ('LEFTPADDING', (0, 0), (-1, -1), 8),
                ('RIGHTPADDING', (0, 0), (-1, -1), 8),
                ('TOPPADDING', (0, 0), (-1, -1), 6),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ]))
            
            story.append(table)
            story.append(Spacer(1, 0.4*cm))
        
        story.append(Spacer(1, 0.3*cm))
    
    story.append(PageBreak())
    
    # ═══════════════════════════════════════════════════════
    # RECOMENDAÇÕES
    # ═══════════════════════════════════════════════════════
    story.append(Paragraph("5. Recomendações Priorizadas", heading1))
    
    recomendacoes = [
        ("P1 - CRÍTICO", "Adicionar validação de ownership em TODOS os endpoints IDOR", 
         "Implementar user_id/tenant_id em todas as tabelas e filtrar todas as queries. Se o sistema permanecerá single-user, documentar isso explicitamente e adicionar warnings caso múltiplos usuários sejam adicionados futuramente."),
        
        ("P2 - CRÍTICO", "Proteger endpoints de manipulação de exchange keys", 
         "DELETE /api/keys/{key_name} e POST /api/keys/{name}/swap devem validar ownership antes de executar. Swap de ativos é equivalente a transferência de dinheiro."),
        
        ("P3 - CRÍTICO", "Validar ownership em fechamento de posições live", 
         "POST /api/trades/positions/{position_id}/close pode causar perdas financeiras reais. Adicionar verificação rigorosa de ownership + confirmação extra para live mode."),
        
        ("P4 - ALTA", "Implementar RBAC ou sistema de permissões", 
         "Se o projeto evoluir para multi-user, implementar roles (admin, trader, viewer) e proteger endpoints administrativos."),
        
        ("P5 - MÉDIA", "Adicionar auditoria de ações sensíveis", 
         "Logar todas operações de delete, swap, force-close com timestamp, IP e user identificador para forensics.")
    ]
    
    for prior, titulo, descricao in recomendacoes:
        story.append(Paragraph(f"<b>{prior}:</b> {titulo}", body_style))
        story.append(Paragraph(descricao, body_style))
        story.append(Spacer(1, 0.4*cm))
    
    story.append(PageBreak())
    
    # ═══════════════════════════════════════════════════════
    # ISSUES PARA GITHUB
    # ═══════════════════════════════════════════════════════
    story.append(Paragraph("6. Issues para GitHub", heading1))
    story.append(Paragraph("As issues abaixo estão prontas para copiar e colar no GitHub:", body_style))
    story.append(Spacer(1, 0.5*cm))
    
    # Agrupar issues por tipo
    issues = [
        {
            "titulo": "[Segurança] IDOR crítico em todos os endpoints de trades e bots",
            "labels": "security, critical",
            "corpo": """## Descrição
9 endpoints críticos não validam ownership, permitindo que qualquer usuário autenticado manipule recursos alheios.

## Endpoints Afetados
- `DELETE /api/trades/positions/{position_id}` - deletar posição alheia
- `POST /api/trades/positions/{position_id}/close` - fechar posição live alheia
- `PUT /api/bots/{bot_id}` - editar bot alheio
- `DELETE /api/bots/{bot_id}` - deletar bot alheio
- `DELETE /api/bots/{bot_name}/cache` - limpar cache alheio
- `GET /api/keys/{key_name}/balance` - ver saldo alheio
- `DELETE /api/keys/{key_name}` - deletar API key alheia
- `POST /api/keys/{name}/swap` - executar swap em carteira alheia
- `POST /api/trades/positions/bulk-delete` - deleção em massa sem validação

## Impacto
**CRÍTICO:** Perdas financeiras diretas, manipulação de trades reais, acesso a credenciais de exchanges.

## Evidência
```python
# backend/routers/trades.py:401
pos = db.query(Position).filter(Position.id == position_id).first()
# Sem filtro de user_id/tenant_id
```

## Correção Sugerida
1. Adicionar coluna `user_id` ou `tenant_id` em todas as tabelas (bots, positions, orders, exchange_keys)
2. Modificar TODAS as queries para filtrar por ownership:
```python
pos = db.query(Position).filter(
    Position.id == position_id,
    Position.user_id == current_user.id  # ou tenant_id
).first()
```
3. Se o sistema permanecerá single-user, documentar explicitamente e adicionar validação em startup que bloqueia multi-user

## Critérios de Aceite
- [ ] Todas as queries filtram por ownership
- [ ] Testes unitários verificam rejeição de acesso a recursos alheios
- [ ] Documentação atualizada sobre modelo de autenticação (single vs multi-user)
- [ ] Se multi-user, migration criada para adicionar user_id/tenant_id"""
        },
        {
            "titulo": "[Segurança] Ausência de mecanismo de isolamento multi-tenant",
            "labels": "security, critical, architecture",
            "corpo": """## Descrição
O sistema não possui isolamento de dados. Todas as queries buscam recursos de todos os usuários sem filtro de tenant/ownership.

## Problema Arquitetural
- Tabelas não possuem coluna `user_id` ou `tenant_id`
- Sistema é single-user por design (uma MASTER_API_KEY global)
- Porém, arquitetura permite múltiplos bots e API keys sem isolamento
- GET /api/bots/ retorna TODOS os bots do sistema
- GET /api/keys retorna TODAS as API keys cadastradas

## Impacto
Se um segundo usuário for adicionado (ou se alguém roubar a MASTER_API_KEY), terá acesso total a todos os dados.

## Decisão Necessária
O projeto deve escolher explicitamente:

**Opção A - Single-User Enforcement:**
- Documentar que é self-hosted single-user apenas
- Adicionar validação em startup que bloqueia criação de múltiplas sessões
- Renomear MASTER_API_KEY para OWNER_KEY
- Adicionar warning na UI se detectar múltiplos usuários

**Opção B - Multi-Tenant:**
- Adicionar user_id/tenant_id em todas as tabelas
- Implementar sistema de registro/autenticação por usuário
- Refatorar TODOS os endpoints para filtrar por tenant
- Adicionar RLS (Row Level Security) se migrar para PostgreSQL

## Critérios de Aceite
- [ ] Decisão arquitetural documentada (A ou B)
- [ ] Se A: validações de single-user implementadas
- [ ] Se B: migration completa + refactor de queries + testes"""
        },
        {
            "titulo": "[Segurança] Swap endpoint permite manipulação financeira de carteiras alheias",
            "labels": "security, critical, financial",
            "corpo": """## Descrição
`POST /api/keys/{name}/swap` executa market orders na exchange usando API key alheia, sem validar ownership.

## Arquivo
`backend/routers/keys.py:243`

## Exploit
```bash
# Atacante descobre nome de uma API key (via GET /api/keys)
curl -X POST https://api/victim.com/api/keys/victim_okx_key/swap \\
  -H "X-API-Key: $ATACANTE_MASTER_KEY" \\
  -d '{"from_asset": "BTC", "to_asset": "DOGE", "amount": 1000000, "amount_type": "from"}'
# BTC da vítima é trocado por DOGE (perda financeira)
```

## Impacto
**CRÍTICO:** Drenagem de fundos. Atacante pode:
- Trocar ativos valiosos por memecoins ilíquidos
- Forçar swaps em momentos de baixa liquidez (slippage alto)
- Mover fundos para pares que não podem ser revertidos

## Correção
```python
@router.post("/{name}/swap")
def execute_quick_swap(name: str, payload: dict, db: Session, current_user = Depends(get_current_user)):
    key_record = db.query(ExchangeKey).filter(
        ExchangeKey.name == name,
        ExchangeKey.user_id == current_user.id  # ADICIONAR
    ).first()
    if not key_record:
        raise HTTPException(status_code=404, detail="Key not found or access denied")
    # ... resto do código
```

## Critérios de Aceite
- [ ] Swap requer ownership da API key
- [ ] Teste: usuário A não pode fazer swap com key de usuário B
- [ ] Adicionar rate limiting (máximo N swaps por minuto)
- [ ] Logar todas operações de swap para auditoria"""
        }
    ]
    
    for i, issue in enumerate(issues, 1):
        story.append(Paragraph(f"<b>ISSUE {i}</b>", heading2))
        
        corpo_escaped = issue['corpo'].replace('\n', '<br/>')
        issue_text = f"""
        <b>Título:</b> {issue['titulo']}<br/>
        <b>Labels:</b> {issue['labels']}<br/><br/>
        <b>Corpo da Issue:</b><br/>
        <font face='Courier' size='8'>{corpo_escaped}</font>
        """
        story.append(Paragraph(issue_text, body_style))
        story.append(Spacer(1, 0.8*cm))
        
        if i < len(issues):
            story.append(Paragraph("─" * 80, body_style))
            story.append(Spacer(1, 0.5*cm))
    
    # Build PDF
    doc.build(story, canvasmaker=NumberedCanvas)
    print(f"✓ Relatório gerado: {output_path}")
    return output_path

if __name__ == "__main__":
    try:
        pdf_path = generate_pdf()
        print(f"\n{'='*60}")
        print(f"RELATÓRIO DE AUDITORIA GERADO COM SUCESSO")
        print(f"{'='*60}")
        print(f"Arquivo: {pdf_path}")
        print(f"Total de achados: {len(ACHADOS)}")
        print(f"  • Críticos: {len([a for a in ACHADOS if a['severidade'] == 'crítica'])}")
        print(f"  • Altos: {len([a for a in ACHADOS if a['severidade'] == 'alta'])}")
        print(f"  • Médios: {len([a for a in ACHADOS if a['severidade'] == 'média'])}")
    except Exception as e:
        print(f"ERRO ao gerar relatório: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
