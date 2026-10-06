"""Export the product showcase as a designed, four-page Korean PDF.

Uses screenshots of the working synthetic demo, not generated venue evidence.
"""
from pathlib import Path
import argparse
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.utils import ImageReader
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'output' / 'pdf' / '시야체크_AI_서비스소개.pdf'
ASSETS = ROOT / 'showcase' / 'references' / 'screenshots'
W, H = 595.28, 841.89
M = 42
BG, PANEL, FG, MUTED, LIME = map(HexColor, ['#0c0d0b', '#191c16', '#f6f7ef', '#bdc3b5', '#d7ef99'])


def main():
    args = argparse.ArgumentParser()
    args.add_argument('--site-url', default='')
    opt = args.parse_args()
    pdfmetrics.registerFont(TTFont('Korean', 'C:/Windows/Fonts/malgun.ttf'))
    pdfmetrics.registerFont(TTFont('KoreanBold', 'C:/Windows/Fonts/malgunbd.ttf'))
    OUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT), pagesize=(W, H), pageCompression=1)
    c.setTitle('시야체크 AI - 서비스 소개')
    c.setAuthor('SightCheck AI')
    c.setSubject('좌석별 시야 비교와 공연장 도입 과정 - 가상 공연장 데모')

    def text(s, x, top, size=12, color=FG, bold=False):
        c.setFont('KoreanBold' if bold else 'Korean', size)
        c.setFillColor(color)
        c.drawString(x, H-top-size, s)

    def para(s, x, top, width, size=12, color=MUTED, bold=False):
        style = ParagraphStyle('body', fontName='KoreanBold' if bold else 'Korean',
                               fontSize=size, leading=size*1.6, textColor=color,
                               wordWrap='CJK', spaceAfter=0)
        p = Paragraph(s, style)
        _, ht = p.wrap(width, H)
        p.drawOn(c, x, H-top-ht)
        assert top+ht < H-48, (s[:40], top+ht)
        return ht

    def card(x, top, width, height, fill=PANEL):
        c.setFillColor(fill)
        c.roundRect(x, H-top-height, width, height, 10, stroke=0, fill=1)

    def start(n, label):
        c.setFillColor(BG)
        c.rect(0, 0, W, H, stroke=0, fill=1)
        text('시야체크 AI', M, 26, 13, FG, True)
        c.setFont('Helvetica', 8)
        c.setFillColor(MUTED)
        c.drawRightString(W-M, H-40, 'SIGHTCHECK / PRODUCT SHOWCASE')
        c.setStrokeColor(HexColor('#34392f'))
        c.line(M, H-61, W-M, H-61)
        text(label, M, 84, 10, LIME)
        c.line(M, 39, W-M, 39)
        text('가상 공연장 데모 · 실제 공연장 실증 전', M, H-30, 8, MUTED)
        c.setFont('Helvetica', 8)
        c.drawRightString(W-M, 16, f'{n:02d} / 04')

    def image(name, x, top, width):
        p = ASSETS / name
        with Image.open(p) as im:
            ht = width*im.height/im.width
        c.drawImage(ImageReader(str(p)), x, H-top-ht, width, ht, mask='auto')
        return ht

    start(1, '01 / 예매하기 전, 내 자리의 시야부터')
    text('그 자리,', M, 117, 40, FG, True)
    text('잘 보일까요?', M, 174, 40, LIME, True)
    para('“시야가 제한될 수 있습니다.”<br/>글 한 줄로는 알 수 없었던 내 자리.<br/>이번 공연에서 무엇이 가리는지, 먼저 보고 선택하세요.',
         M, 251, W-2*M, 14, FG)
    h = image('hero.jpg', M, 348, W-2*M)
    text('실행 중인 소개 웹사이트 화면 · 좌석과 무대는 시연용 데이터', M, 348+h+9, 9, MUTED)
    card(M, 692, W-2*M, 84)
    para('좌석의 위치를 넘어, 그 자리에서 보이는 경험까지.<br/>시야체크 AI는 공간 데이터를 바탕으로 좌석별 시야를 확인하고 비교하는 서비스입니다.',
         M+18, 707, W-2*M-36, 12, FG)
    c.showPage()

    start(2, '02 / 관객이 확인할 수 있는 차이')
    text('두 자리를, 같은 기준으로.', M, 118, 27, FG, True)
    para('같은 공연도 좌석에 따라 다르게 보입니다. 난간과 구조물의 가림을 눈으로 확인하고, 동일한 눈높이와 화각으로 비교합니다.', M, 171, W-2*M)
    h = image('seat-compare.jpg', M, 234, W-2*M)
    text('C3와 D3 비교 · 뮤지컬 배치 · 눈높이 1.20m · 화각 60°', M, 234+h+11, 10, LIME)
    gap = 14
    cw = (W-2*M-gap)/2
    for x, label, num, body in [
        (M, 'C3 / 난간이 있는 좌석', '69%', '무대 전면의 표본 중 난간에 가리지 않은 표본 비율'),
        (M+cw+gap, 'D3 / 비교 좌석', '100%', '동일한 설정에서 고정 구조물에 가리지 않은 표본 비율')]:
        card(x, 529, cw, 144)
        text(label, x+16, 544, 11, MUTED)
        text(num, x+16, 568, 30, LIME, True)
        para(body, x+16, 621, cw-32, 10, MUTED)
    para('<b>웹에서 체험할 수 있는 기능</b><br/>좌석 선택 · 두 자리 비교 · 공간 전체 보기 · 눈높이 조절 · 촬영 타워가 추가된 공연 배치',
         M, 696, W-2*M, 12, FG)
    c.showPage()

    start(3, '03 / 공연장·기획자의 도입 흐름')
    text('공간을 준비하고,', M, 118, 27, FG, True)
    text('관객의 선택에 연결합니다.', M, 161, 27, LIME, True)
    steps = [
        ('01', '공간 자료 준비', '축척 있는 평면·단면도, 좌석 배치와 무대 위치, 난간·촬영 타워의 치수를 준비합니다.'),
        ('02', '후보 추출 · 치수 보정 · 검수', 'VLM과 OCR로 공간 요소의 후보를 추출하는 구조를 목표로 합니다. 운영자가 좌표와 높이를 보정하고 대표 좌석 사진과 대조합니다.'),
        ('03', '예매 화면에 연결', '검수한 공연 배치를 링크나 위젯으로 제공합니다. 공연별 구조물이 바뀌면 배치를 갱신하고 다시 검수합니다.')]
    for i, (n, title, body) in enumerate(steps):
        top=244+i*142
        card(M, top, W-2*M, 123)
        text(n, M+18, top+18, 22, LIME, True)
        text(title, M+68, top+18, 15, FG, True)
        para(body, M+68, top+50, W-2*M-87, 12)
        if i < 2:
            c.setStrokeColor(LIME)
            c.line(M+29, H-top-123, M+29, H-top-142)
    card(M, 693, W-2*M, 80, HexColor('#24301c'))
    para('<b>평면도 한 장만으로 높이와 가림을 확정할 수는 없습니다.</b><br/>축척·기준 길이, 단면 높이, 공연별 구조물 위치가 필요합니다. 대표 좌석 사진은 모델과 실제 시야를 대조하는 데 사용합니다.',
         M+18, 706, W-2*M-36, 11, FG)
    c.showPage()

    start(4, '04 / 구현 방식과 검증 범위')
    text('멋진 표현보다,', M, 118, 27, FG, True)
    text('믿을 수 있는 비교 기준.', M, 161, 27, LIME, True)
    text('하나의 3D 공간, 여러 좌석의 시점', M, 236, 16, FG, True)
    para('Three.js의 3D 공간에서 좌석 카메라를 이동합니다. 좌석마다 별도의 AI 이미지를 생성하는 방식이 아닙니다. 눈 위치에서 무대 전면의 325개 표본으로 광선을 보내 고정 구조물의 가림을 계산합니다.', M, 270, W-2*M)
    text('현재 웹사이트에서 확인할 수 있는 것', M, 363, 16, FG, True)
    para('가상 공연장 20석의 시야 비교, 눈높이와 공연 배치 변경, 공간 자료 준비부터 게시까지의 도입 목업을 체험할 수 있습니다. 실제 예매·결제, 파일 업로드, 실시간 VLM 도면 분석은 이 소개 페이지에 포함되지 않습니다.', M, 397, W-2*M)
    text('실서비스 적용 전에 확인할 것', M, 490, 16, FG, True)
    para('도면의 출처와 이용 권한을 확인하고, 실측 치수와 좌석 위치를 검수해야 합니다. 동일 공연 배치의 대표 좌석에서 촬영한 사진으로 시야를 대조해야 합니다. 앞사람의 키·움직임, 배우 동선과 현장 연출은 현재 계산에 포함되지 않습니다.', M, 524, W-2*M)
    card(M, 630, W-2*M, 61, HexColor('#24301c'))
    para('표본 비율은 실제로 보이는 무대 면적이나 관람 만족도와 다릅니다. 이 PDF와 웹사이트는 아이디어와 사용 흐름을 설명하는 가상 데모입니다.', M+16, 642, W-2*M-32, 11, FG)
    site = opt.site_url or 'https://github.com/PhrenO0/sightcheck-ai'
    text('웹 체험 / 프로젝트', M, 710, 9, LIME, True)
    text(site, M, 728, 9, FG)
    c.linkURL(site, (M, H-743, W-M, H-726), relative=0)
    text('디자인 참고: OpenDesign / 모션: Motion, Lenis / 3D: Three.js', M, 753, 8, MUTED)
    c.linkURL('https://github.com/nexu-io/open-design', (M, H-767, W-M, H-752), relative=0)
    c.showPage()
    c.save()
    print(OUT)


if __name__ == '__main__':
    main()
