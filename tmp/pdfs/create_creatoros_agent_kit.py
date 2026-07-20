from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.graphics import renderPDF


ROOT = Path('/Users/zyongzhu/ThirdSpace/04-项目/产品系统/202607_CreatorOS')
ASSETS = ROOT / '商业化/资产/宣发海报'
MANUAL = ROOT / '产品手册'
OUT = Path('output/pdf/CreatorOS-代理协作手册.pdf')
FONT = Path('/System/Library/AssetsV2/com_apple_MobileAsset_Font8/53fe5be564086fefc7523ccd0a31200acf92e0e5.asset/AssetData/STHEITI.ttf')

PAGE_W, PAGE_H = A4
INK = HexColor('#19172A')
PURPLE = HexColor('#6842F5')
SOFT_PURPLE = HexColor('#F0EDFF')
MINT = HexColor('#5EE5B6')
MUTED = HexColor('#6C687E')
LINE = HexColor('#E7E4F2')


def font_setup():
    pdfmetrics.registerFont(TTFont('CN', str(FONT)))


def text(c, value, x, y, size=11, color=INK, leading=None):
    c.setFillColor(color)
    c.setFont('CN', size)
    c.drawString(x, y, value)


def wrapped(c, value, x, y, width, size=11, color=INK, leading=None):
    leading = leading or size * 1.55
    c.setFillColor(color)
    c.setFont('CN', size)
    line = ''
    cursor = y
    for ch in value:
        candidate = line + ch
        if c.stringWidth(candidate, 'CN', size) > width and line:
            c.drawString(x, cursor, line)
            cursor -= leading
            line = ch
        else:
            line = candidate
    if line:
        c.drawString(x, cursor, line)
        cursor -= leading
    return cursor


def cover_bg(c):
    c.setFillColor(INK)
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    c.setFillColor(PURPLE)
    c.circle(PAGE_W * .92, PAGE_H * .92, 160, fill=1, stroke=0)
    c.setFillColor(HexColor('#2C2155'))
    c.circle(PAGE_W * .05, PAGE_H * .14, 120, fill=1, stroke=0)


def header(c, section, page):
    c.setFillColor(white)
    c.rect(0, PAGE_H - 58, PAGE_W, 58, fill=1, stroke=0)
    text(c, 'CreatorOS', 40, PAGE_H - 35, 13, PURPLE)
    text(c, section, 132, PAGE_H - 35, 10, MUTED)
    text(c, f'{page} / 6', PAGE_W - 70, PAGE_H - 35, 9, MUTED)


def footer(c):
    c.setStrokeColor(LINE)
    c.line(40, 35, PAGE_W - 40, 35)
    text(c, '渠道合作资料｜内测版｜合作政策以双方确认版本为准', 40, 20, 8, MUTED)


def rounded_card(c, x, y, w, h, fill=white):
    c.setFillColor(fill)
    c.setStrokeColor(LINE)
    c.roundRect(x, y, w, h, 14, fill=1, stroke=1)


def add_image(c, path, x, y, w, h, crop=True):
    img = ImageReader(str(path))
    iw, ih = img.getSize()
    scale = max(w / iw, h / ih) if crop else min(w / iw, h / ih)
    dw, dh = iw * scale, ih * scale
    dx, dy = x + (w - dw) / 2, y + (h - dh) / 2
    c.saveState()
    c.rect(x, y, w, h, fill=0, stroke=0)
    c.clipPath(c.beginPath(), fill=0, stroke=0) if False else None
    c.drawImage(img, dx, dy, width=dw, height=dh, mask='auto')
    c.restoreState()


def draw_qr(c, data, x, y, size):
    widget = qr.QrCodeWidget(data)
    bounds = widget.getBounds()
    scale = size / (bounds[2] - bounds[0])
    d = Drawing(size, size, transform=[scale, 0, 0, scale, 0, 0])
    d.add(widget)
    renderPDF.draw(d, c, x, y)


def page_cover(c):
    cover_bg(c)
    hero = ASSETS / 'hero-local-notext.png'
    add_image(c, hero, 55, 355, PAGE_W - 110, 290, crop=False)
    text(c, 'CreatorOS', 50, 772, 17, MINT)
    text(c, '渠道合作资料', 50, 715, 36, white)
    text(c, '让内容创作从“每次重新开始”变成可复利的系统。', 50, 680, 15, HexColor('#DED9F7'))
    rounded_card(c, 50, 115, PAGE_W - 100, 142, HexColor('#26213E'))
    text(c, '当前阶段说明', 72, 226, 12, MINT)
    wrapped(c, 'CreatorOS 当前处于内测交付阶段：产品以内测直营为主。渠道合作资料用于建立合作认知、收集伙伴意向和准备正式商业化后的合作承接；具体产品、授权、结算与支持范围，以双方确认版本为准。', 72, 198, PAGE_W - 145, 11, HexColor('#F2F0FF'))
    text(c, '2026.07｜内测版', 50, 72, 9, HexColor('#BBB4E9'))
    c.showPage()


def page_value(c):
    header(c, '产品价值', 2)
    text(c, '卖的不是一堆 AI 功能，', 40, 730, 27)
    text(c, '而是一套能积累的内容生产系统。', 40, 694, 27, PURPLE)
    wrapped(c, 'CreatorOS 把账号定位、选题、脚本、制作、发布登记、真实数据复盘和经验回流连成闭环。对客户而言，每完成一条内容，下一条都有更多真实依据。', 40, 650, 260, 11, MUTED)
    add_image(c, ASSETS / '宣发海报-飞轮流程.png', 320, 485, 230, 215, crop=False)
    items = [
        ('定位不是一次性表格', '把账号是谁、服务谁、凭什么讲清楚，后续选题和脚本才有共同约束。'),
        ('选题不是碰运气', '从评论、知识库、热点与历史经验中沉淀真实信号。'),
        ('复盘不是看热闹', '把预测、真实表现和有效经验带回下一轮创作。'),
    ]
    y = 430
    for i, (title, desc) in enumerate(items, 1):
        rounded_card(c, 40, y - 82, PAGE_W - 80, 70, SOFT_PURPLE)
        text(c, f'0{i}', 56, y - 42, 16, PURPLE)
        text(c, title, 105, y - 35, 13, INK)
        wrapped(c, desc, 105, y - 56, PAGE_W - 165, 9.5, MUTED, 14)
        y -= 92
    footer(c)
    c.showPage()


def page_product(c):
    header(c, '客户能看到什么', 3)
    text(c, '把“创作流程”装进一个工作台。', 40, 730, 26)
    wrapped(c, '渠道伙伴对客户介绍时，可以先讲一个结果：从定位到选题、脚本、制作、发布和复盘，都在同一套本地工作流里完成。', 40, 694, 500, 11, MUTED)
    shots = [
        (MANUAL / 'CreatorOS-手册-01-首页.png', '首页驾驶舱', '掌握创作进度与入口'),
        (MANUAL / 'CreatorOS-手册-03-选题.png', '选题池', '从真实信号中选择方向'),
        (MANUAL / 'CreatorOS-手册-05-脚本.png', '脚本工作面', '素材、论点、口播稿与审核'),
        (MANUAL / 'CreatorOS-手册-07-复盘.png', '复盘', '对照预测与真实数据'),
    ]
    positions = [(40, 410), (307, 410), (40, 160), (307, 160)]
    for (path, title, note), (x, y) in zip(shots, positions):
        rounded_card(c, x, y, 245, 210)
        add_image(c, path, x + 10, y + 57, 225, 130, crop=False)
        text(c, title, x + 12, y + 36, 12, INK)
        text(c, note, x + 12, y + 19, 8.8, MUTED)
    # Redraw header after image placement to keep the navigation strip crisp.
    header(c, '客户能看到什么', 3)
    footer(c)
    c.showPage()


def page_fit(c):
    header(c, '适合谁卖给谁', 4)
    text(c, '最适合有“内容结果”诉求的人群。', 40, 730, 26)
    add_image(c, ASSETS / '宣发海报-适合谁.png', 40, 415, 260, 235, crop=False)
    groups = [
        ('个人创作者', '已经在稳定做内容，但选题、写稿、复盘靠记忆和零散工具。'),
        ('内容型教练 / 顾问', '需要稳定输出专业内容，并把客户问题沉淀为选题资产。'),
        ('小团队内容负责人', '希望把账号经验、素材与项目进度留在团队可复用的工作流里。'),
        ('服务客户的机构', '已有内容服务能力，希望给客户提供更完整的“系统 + 陪跑”交付。'),
    ]
    y = 635
    for title, desc in groups:
        rounded_card(c, 325, y - 78, 230, 65)
        text(c, title, 342, y - 35, 12, PURPLE)
        wrapped(c, desc, 342, y - 54, 195, 8.8, MUTED, 12)
        y -= 87
    wrapped(c, '不建议把产品卖给只想“一键爆款”的用户。CreatorOS 的价值在于把持续创作变成可积累的能力。', 40, 245, PAGE_W - 80, 10, MUTED)
    # Redraw header after the poster image, which may contain a large transparent canvas.
    header(c, '适合谁卖给谁', 4)
    footer(c)
    c.showPage()


def page_partner(c):
    header(c, '渠道伙伴怎么参与', 5)
    text(c, '把你的既有客户关系，变成更完整的交付。', 40, 730, 25)
    stages = [
        ('1. 发现机会', '从现有客户中识别：内容输出不稳定、选题枯竭、复盘没有沉淀的人。'),
        ('2. 讲清产品', '用“内容生产闭环”和产品截图沟通，不承诺虚构的流量结果。'),
        ('3. 协助启动', '引导客户完成安装、激活、模型配置、账号绑定与首次定位。'),
        ('4. 跟进使用', '提醒客户完成第一条内容和第一次复盘，把真实反馈带回团队。'),
    ]
    y = 660
    for i, (title, desc) in enumerate(stages):
        c.setFillColor(PURPLE)
        c.circle(62, y + 2, 17, fill=1, stroke=0)
        text(c, str(i + 1), 57, y - 3, 11, white)
        text(c, title, 95, y + 5, 13, INK)
        wrapped(c, desc, 95, y - 17, 410, 10, MUTED, 15)
        c.setStrokeColor(LINE)
        c.line(62, y - 60, 62, y - 85)
        y -= 120
    rounded_card(c, 40, 110, PAGE_W - 80, 92, SOFT_PURPLE)
    text(c, '合作边界', 58, 172, 12, PURPLE)
    wrapped(c, '渠道伙伴负责可信的客户沟通与启动陪伴；产品授权、交付规则、支持范围、结算与对外表达，由 CreatorOS 团队在合作确认后提供统一口径。', 58, 150, PAGE_W - 120, 10, MUTED)
    footer(c)
    c.showPage()


def page_start(c):
    header(c, '合作下一步', 6)
    text(c, '先对齐客户与交付，再谈规模。', 40, 730, 26)
    steps = [
        ('了解产品', '先体验一次 CreatorOS 的完整创作链路。'),
        ('确认客户画像', '说清你现有客户里，谁最需要解决持续创作问题。'),
        ('沟通合作方式', '确认角色、交付、支持、授权与后续政策。'),
        ('从小范围验证', '用少量真实客户验证话术、启动路径和复盘闭环。'),
    ]
    x = 40
    for i, (title, note) in enumerate(steps):
        rounded_card(c, x, 470, 122, 150, SOFT_PURPLE if i % 2 == 0 else white)
        text(c, f'0{i+1}', x + 16, 580, 18, PURPLE)
        wrapped(c, title, x + 16, 548, 90, 12, INK, 16)
        wrapped(c, note, x + 16, 510, 90, 8.5, MUTED, 12)
        x += 130
    rounded_card(c, 40, 170, 350, 205, INK)
    text(c, '渠道合作咨询', 66, 330, 17, white)
    wrapped(c, '扫描右侧二维码进入 CreatorOS 官网，或联系 CreatorOS 团队，说明你的客户类型、可覆盖人群与希望的合作方式。', 66, 294, 280, 11, HexColor('#DDD8F7'))
    text(c, '官网  creatoros.aitongban.cloud', 66, 205, 10, MINT)
    rounded_card(c, 414, 170, 140, 205, white)
    draw_qr(c, 'https://creatoros.aitongban.cloud/', 436, 215, 96)
    text(c, '了解 CreatorOS', 432, 190, 9, MUTED)
    footer(c)
    c.showPage()


def page_manual_cover(c):
    cover_bg(c)
    text(c, 'ThirdSpace 创作矩阵', 50, 775, 15, MINT)
    text(c, '代理协作手册', 50, 704, 37, white)
    text(c, '你代理什么 · 你赚几条钱 · 官方给你什么 · 怎么开始', 50, 670, 14, HexColor('#DED9F7'))
    add_image(c, ASSETS / 'hero-flywheel-notext.png', 90, 372, PAGE_W - 180, 220, crop=False)
    rounded_card(c, 50, 120, PAGE_W - 100, 180, HexColor('#26213E'))
    text(c, '给认真做 AI 内容生意的合作伙伴', 74, 263, 14, MINT)
    wrapped(c, '不是卖一个孤立工具，而是把四条创作赛道、代理后台、白标锁客、全套物料和续费年金一起交给渠道。你负责卖和服务客户，官方负责产品、发码与交付体系。', 74, 230, PAGE_W - 150, 12, HexColor('#F2F0FF'))
    text(c, '资料依据：20260719《创作矩阵 · 代理协作手册》及已出图招商物料', 50, 72, 8.5, HexColor('#BBB4E9'))
    c.showPage()


def page_asset(c, image, label, page):
    c.setFillColor(HexColor('#F8F7FC'))
    c.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
    text(c, label, 40, PAGE_H - 35, 10, MUTED)
    text(c, f'{page} / 6', PAGE_W - 70, PAGE_H - 35, 9, MUTED)
    add_image(c, image, 40, 65, PAGE_W - 80, PAGE_H - 130, crop=False)
    c.showPage()


def page_rules_manual(c):
    header(c, '合作规则与渠道保护', 5)
    text(c, '分级经销、纯差价、守价盘。', 40, 730, 26)
    wrapped(c, '合作结构是官方 → 一级代理 → 二级代理 → 终端客户，封顶在二级。各级只赚进销差价和续费分成，不收加盟费、不按人头返佣、不做团队计酬。', 40, 692, PAGE_W - 80, 11, MUTED)
    rounded_card(c, 40, 546, PAGE_W - 80, 108, INK)
    text(c, '官方', 74, 603, 15, white)
    text(c, '→', 146, 603, 18, MINT)
    text(c, '一级代理', 178, 603, 15, white)
    text(c, '→', 280, 603, 18, MINT)
    text(c, '二级代理', 312, 603, 15, white)
    text(c, '→', 414, 603, 18, MINT)
    text(c, '终端客户', 446, 603, 15, white)
    text(c, '二级不再发展下级；系统从结构上限制无限层级。', 74, 570, 10, HexColor('#DED9F7'))
    cards = [
        ('早鸟拿货折', '3 个起拿 5 折；4–8 个 4 折；8 个以上 3 折；量大面议。'),
        ('最低零售价', '基础 ¥1680 / Plus ¥2599 / Pro ¥3980；可在锚价之上加价，不得低于锚价。'),
        ('码与售后', '未发出的激活码可退或换；已发给客户并激活的码视为已交付，不退。'),
    ]
    y = 485
    for title, desc in cards:
        rounded_card(c, 40, y - 72, PAGE_W - 80, 62, SOFT_PURPLE)
        text(c, title, 58, y - 34, 12, PURPLE)
        wrapped(c, desc, 165, y - 30, 350, 9.5, MUTED, 13)
        y -= 82
    rounded_card(c, 40, 125, PAGE_W - 80, 100, white)
    text(c, '白标锁客', 58, 188, 13, PURPLE)
    wrapped(c, '客户装机后，购买、续期、下载新版和联系授权方跳转到代理自己的专属飞书链接；未配置时入口隐藏，不回退官方链接。客户关系和复购沉淀在代理侧。', 58, 164, PAGE_W - 120, 10, MUTED)
    footer(c)
    c.showPage()


def page_start_manual(c):
    header(c, '怎么开始 · 常见疑虑', 6)
    text(c, '四步开卖，把一次客户成交做成长线年金。', 40, 730, 24)
    steps = [
        ('谈拢拿货', '确认拿货量（3 个起）与阶梯折，完成付款。'),
        ('开通后台', '领取邀请码，配置购买、续期、下载和联系入口的白标链接。'),
        ('领取物料', '拿海报、对比图、话术、异议应答与产品使用手册，搭好私域承接。'),
        ('开卖 + 养客', '先用 CreatorOS 破局，再向客户加购其它赛道；客户续费可持续获得分成。'),
    ]
    x = 40
    for i, (title, note) in enumerate(steps):
        rounded_card(c, x, 470, 122, 150, SOFT_PURPLE if i % 2 == 0 else white)
        text(c, f'0{i+1}', x + 16, 580, 18, PURPLE)
        wrapped(c, title, x + 16, 546, 90, 11.5, INK, 16)
        wrapped(c, note, x + 16, 505, 90, 8.5, MUTED, 12)
        x += 130
    rounded_card(c, 40, 165, PAGE_W - 80, 245, INK)
    text(c, '关键口径', 64, 370, 14, MINT)
    lines = [
        '商业版官方退出零售，不与代理抢终端客户。',
        '客户次年维护续费，早鸟代理拿 95%，官方抽 5%（后续批次政策可调整）。',
        '企业线索由官方或深度伙伴成交，转介佣金首单 10–20%；有能力可参与定制交付。',
        '内测 ¥899 买断仅限 200 位创始用户、私域直营，不进入代理分销渠道。',
    ]
    y = 338
    for line in lines:
        c.setFillColor(MINT)
        c.circle(72, y + 3, 3, fill=1, stroke=0)
        wrapped(c, line, 86, y, 420, 10, HexColor('#F2F0FF'), 15)
        y -= 42
    text(c, '招商入口微信、收款方式与代理后台地址须在正式发放前补齐。', 40, 92, 9, MUTED)
    header(c, '怎么开始 · 常见疑虑', 6)
    footer(c)
    c.showPage()


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)
    font_setup()
    c = canvas.Canvas(str(OUT), pagesize=A4, pageCompression=1)
    c.setTitle('ThirdSpace 创作矩阵｜代理协作手册')
    c.setAuthor('ThirdSpace / CreatorOS')
    page_manual_cover(c)
    page_asset(c, ASSETS / '宣发-矩阵代理招商.png', '矩阵、后台、收入与拿货折', 2)
    page_asset(c, ASSETS / '宣发-代理招商一页纸.png', '代理招商一页纸', 3)
    page_asset(c, ASSETS / '宣发-三模式总览.png', '三种商业模式总览', 4)
    page_rules_manual(c)
    page_start_manual(c)
    c.save()


if __name__ == '__main__':
    main()
