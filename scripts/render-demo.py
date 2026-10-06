"""Render real recorded E2E output into a terminal GIF and an 80s annotated video.
Run the E2E capture first. Nothing in this renderer fabricates decisions or gas.
Requires the agent demo extra (Pillow) and ffmpeg installed on PATH.
"""
import argparse
import json
import subprocess
import textwrap
from functools import lru_cache
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'docs/assets'
BG = '#0a1220'
PANEL = '#111e30'
INK = '#e6edf3'
MUTED = '#96a6bb'
TEAL = '#48dfb0'
RED = '#ff8c8c'


@lru_cache(maxsize=16)
def font(size):
    for candidate in ['/System/Library/Fonts/Menlo.ttc', '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf']:
        if Path(candidate).exists(): return ImageFont.truetype(candidate, size)
    return ImageFont.load_default(size=size)


def terminal(title, command, lines, footer='Actual local E2E output • Fabric chaincode fixture • Ethereum test chain', width=1280, height=720):
    image = Image.new('RGB', (width,height), BG)
    draw = ImageDraw.Draw(image)
    draw.text((48,35),'SUSTAINABLE FASHION CHAIN',font=font(18),fill=TEAL)
    draw.text((48,76),title,font=font(30),fill=INK)
    draw.rounded_rectangle((40,140,width-40,height-70),radius=15,fill=PANEL,outline='#2a3b52',width=2)
    for i,color in enumerate(['#fb7979','#f4c668','#48dfb0']):draw.ellipse((62+i*24,159,73+i*24,170),fill=color)
    draw.text((62,193),'$ '+command,font=font(19),fill=TEAL)
    y=235
    for line in lines:
        for wrapped in textwrap.wrap(line,width=94,replace_whitespace=False,drop_whitespace=False) or ['']:
            color=RED if any(t in wrapped for t in ['REJECTED','MAX_COT','MAX_SINGLE','INSUFFICIENT','STALE']) else INK
            draw.text((62,y),wrapped,font=font(19),fill=color)
            y+=28
    draw.text((48,height-42),footer,font=font(14),fill=MUTED)
    return image


def graph_frame():
    image=Image.new('RGB',(1280,720),BG);d=ImageDraw.Draw(image)
    d.text((48,40),'Verifiable RWA infrastructure',font=font(34),fill=INK)
    d.text((48,94),'Physical custody → public settlement → bounded autonomy',font=font(22),fill=TEAL)
    nodes=[('Physical cotton',70,175),('Fabric',360,175),('Verified relay',650,175),('Ethereum',940,175),
           ('RiskAgent',70,330),('Allocator',360,330),('Policy engine',650,330),('Simulator',940,330)]
    for label,x,y in nodes:
        d.rounded_rectangle((x,y,x+230,y+90),radius=13,fill=PANEL,outline=TEAL if label in ['Policy engine','Ethereum'] else '#3d5574',width=2)
        d.text((x+14,y+29),label,font=font(23),fill=INK)
    for y in [220,375]:
        for x in [300,590,880]:
            d.line((x,y,x+60,y),fill=TEAL,width=3);d.polygon([(x+60,y),(x+49,y-7),(x+49,y+7)],fill=TEAL)
    d.text((70,472),'Agent proposes. Policy authorizes.',font=font(25),fill=INK)
    d.text((70,516),'Simulator verifies. Isolated executor executes.',font=font(25),fill=INK)
    d.text((70,585),'No model keys • Backed issuance • Replay rejection • Audit hashes',font=font(19),fill=TEAL)
    d.text((70,655),'Recorded demonstration: local Ethereum + in-memory Fabric chaincode fixture',font=font(15),fill=MUTED)
    return image


def encode_story(slides, destination):
    """Animate evidence reveal, chapter transitions and elapsed time; keep receipts intact."""
    fps = 10
    process = subprocess.Popen([
        'ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-f', 'rawvideo',
        '-pixel_format', 'rgb24', '-video_size', '1280x720', '-framerate', str(fps),
        '-i', '-', '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20',
        '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(destination)
    ], stdin=subprocess.PIPE)
    total = sum(duration for _, duration in slides)
    elapsed, previous = 0, None
    try:
        for chapter, (slide, duration) in enumerate(slides):
            for tick in range(duration * fps):
                frame = slide.copy()
                draw = ImageDraw.Draw(frame)
                # Reveal actual terminal output in reading order, then hold it steady.
                if chapter and tick < 20:
                    reveal = 235 + int(365 * min(1, tick / 19))
                    draw.rectangle((60, reveal, 1215, 626), fill=PANEL)
                draw.text((1030, 35), f'{chapter+1:02} / {len(slides):02}', font=font(18), fill=MUTED)
                draw.rectangle((40, 653, 1240, 656), fill='#26364b')
                progress = (elapsed + tick / fps) / total
                draw.rectangle((40, 653, 40 + int(1200 * progress), 656), fill=TEAL)
                for boundary in range(1, len(slides)):
                    x = 40 + int(1200 * sum(d for _, d in slides[:boundary]) / total)
                    draw.rectangle((x, 652, x+2, 657), fill=BG)
                if previous is not None and tick < 4:
                    frame = Image.blend(previous, frame, (tick + 1) / 4)
                process.stdin.write(frame.tobytes())
            previous = frame
            elapsed += duration
    except BaseException:
        process.kill()
        raise
    finally:
        process.stdin.close()
        process.wait()
    if process.returncode:
        raise RuntimeError(f'Video encoder failed: {process.returncode}')


def lifecycle_intro(lifecycle):
    image = Image.new('RGB', (1280, 720), BG)
    d = ImageDraw.Draw(image)
    d.text((48, 35), 'SUSTAINABLE FASHION CHAIN', font=font(18), fill=TEAL)
    d.text((48, 95), 'From physical cotton to public asset claims', font=font(32), fill=INK)
    d.text((48, 152), 'One verifiable lifecycle. Two ledgers. Explicit trust boundaries.', font=font(19), fill=MUTED)
    for i, (title, detail) in enumerate([
        ('Physical cotton', 'Farm + custody'), ('Fabric', 'Certification'),
        ('Verified relay', 'Backed issuance'), ('Ethereum', 'COT + ProductNFT')
    ]):
        x = 48 + i * 304
        d.rounded_rectangle((x, 240, x+270, 370), radius=16, fill=PANEL, outline='#34506b', width=2)
        d.text((x+18, 264), title, font=font(22), fill=INK)
        d.text((x+18, 314), detail, font=font(17), fill=TEAL)
        if i < 3:
            d.line((x+272, 305, x+300, 305), fill=TEAL, width=3)
            d.polygon([(x+300,305), (x+291,299), (x+291,311)], fill=TEAL)
    for i, (value, label) in enumerate([
        (f"{int(lifecycle['verifiedKg']):,} kg", 'verified backing'),
        (f"{int(lifecycle['mintedCOT']):,} COT", 'backed claims'),
        (f"NFT #{lifecycle['nft']['tokenId']}", 'garment recycled')
    ]):
        x = 65 + i*402
        d.text((x, 456), value, font=font(34), fill=INK)
        d.text((x, 507), label, font=font(19), fill=MUTED)
    d.text((48, 585), '1 COT = a claim representing 1 kg of certified cotton', font=font(21), fill=TEAL)
    d.text((48, 678), 'Recorded E2E results • Fabric chaincode fixture • Local Ethereum • No real funds', font=font(14), fill=MUTED)
    return image


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--capture',type=Path,default=ASSETS/'recording.json');args=parser.parse_args()
    r=json.loads(args.capture.read_text())
    assert r['simulation']['simulation']['kind']=='eth_call'
    assert r['rejection']['policyResult']['approved'] is False
    assert r['execution']['executionTx']
    s=r['simulation'];sim=s['simulation'];risk=s['riskReport'];proposal=s['proposal'];batch=r['fabric']['batches'][0]
    slides=[(graph_frame(),12),
        (terminal('1 / Verify physical backing','Fabric chaincode: register → store → verify',[
            'Ledger: in-memory fixture using the real chaincode functions','',
            f"Batch: {batch['batchId']}",'Verified cotton: 42,000 kg',
            'Certifier identity: sfc.role=certifier',
            f"Certification hash: {batch['certificationHash'][:26]}...",
            f"Fabric verification tx: {batch['fabricVerificationTxId'][:26]}...",
            'Separate Ethereum attestor registers verified capacity']),14),
        (terminal('2 / Relay approved state to Ethereum','VerifiedRelay → CotToken.mintVerifiedBatch',[
            'Reserve: 42,000 verified kg','Issuance: 35,000 COT','Reserve ratio: 120%','',
            'Replay the same Fabric event:', '  EVENT_ALREADY_PROCESSED — mint reverted','',
            'Retry a lost Fabric acknowledgment: reconcile mined receipt','No second mint. No additional COT supply.']),14),
        (terminal('3 / Agents propose, without signing tools','sfc run --config /demo/local.json',[
            'State source: local_chain (Fabric fixture; real Ethereum RPC)','',
            f"RiskAgent: supply {float(risk['supply_risk']):.2f} | overall {float(risk['overall_risk']):.2f}",
            f"Allocator: {proposal['action']} {proposal['amount']} COT",
            f"Confidence: {float(proposal['confidence']):.0%}",'',
            'Proposal only. No private key, recipient or arbitrary calldata.',
            'Deterministic policy authorizes the action independently.']),12),
        (terminal('4 / Authorize and simulate exact effects','PolicyEngine → eth_call → estimateGas',[
            'PASS: oracle age <= 3600s, backing >= 100%','PASS: exposure <= 35%, single trade <= 10%',
            'PASS: liquidity >= $10,000, slippage <= 50bps','',
            f"Simulation: {sim['kind']} — SUCCESS",f"Estimated gas: {sim['estimated_gas']:,}",
            f"Expected COT delta: +{sim['expected_cot_delta']}",f"Expected USD delta: {sim['expected_usd_delta']}",
            f"Post-trade exposure: {float(sim['post_trade_exposure']):.2%}"]),10),
        (terminal('5 / Isolated local execution','sfc run --mode execute --config /demo/local.json',[
            'Explicit local test signer. No real funds.','Fresh snapshot, policy and eth_call rechecked before signing.','',
            'Transaction confirmed:',r['execution']['executionTx'],'',
            'Exact balance changes verified against simulation.',
            'Onchain: freshness, deadline, slippage, exposure and size guards.',
            'Audit: snapshot hashes, transaction fields, broadcast and confirmation.']),8),
        (terminal('6 / Deliberately dangerous proposal','Allocator proposal: BUY_COT 9000',[
            'Confidence: 99% — confidence does not grant authority.','',
            'Policy Engine:',*['  REJECTED: '+v['policy'] for v in r['rejection']['policyResult']['violations']],
            '', 'ACTION REJECTED', 'No transaction built or sent.','',
            'LLM intelligence ≠ system safety']),10)]
    frames=ROOT/'.runtime/demo-frames';frames.mkdir(parents=True,exist_ok=True);ASSETS.mkdir(parents=True,exist_ok=True)
    for index, (slide, _) in enumerate(slides):
        slide.save(frames/f'{index:02}.png')
    encode_story(slides, ASSETS/'demo.mp4')
    gifs=[slides[i][0].resize((960,540),Image.Resampling.LANCZOS) for i in [3,4,6]]
    gifs[0].save(ASSETS/'terminal-demo.gif',save_all=True,append_images=gifs[1:],duration=[5500,5500,6500],loop=0,optimize=True)
    slides[0][0].save(ASSETS/'demo-poster.png')
    lifecycle = r['lifecycle']
    footer = 'Actual recorded results • Fabric chaincode fixture • Local Ethereum • No real funds'
    lifecycle_slides = [
        (terminal('Verified physical state, public onchain assets', 'SustainableFashionChain', [
            'Farm → Fabric → Verified relay → Ethereum', '',
            'CotToken: backed cotton claims', 'ProductNFT: garment provenance',
            'Recycling: Ethereum event recorded back on Fabric', '',
            '1 COT = claim representing 1 kg of certified cotton'], footer), 10),
        (terminal('1 / Register physical cotton', 'Fabric: registerCottonBatch → storeCottonBatch', [
            f"Batch: {lifecycle['batchId']}", f"Quantity: {int(lifecycle['verifiedKg']):,} kg", '',
            'Custody: Demo farm → DEMO-WH', 'Permissioned identities record provenance.',
            'This recording uses actual chaincode with an in-memory ledger.',
            'The separate live E2E runner exercises Fabric consensus.'], footer), 12),
        (terminal('2 / Verify certification', 'Fabric certifier → separate Ethereum attestor', [
            'Certifier attribute: sfc.role=certifier',
            f"Certification: {lifecycle['certificationHash'][:30]}...",
            f"Fabric verification tx: {lifecycle['fabricVerificationTxId'][:30]}...", '',
            f"Reserve registry: {int(lifecycle['verifiedKg']):,} verified kg",
            'An authorized relay cannot create reserve attestations.'], footer), 12),
        (terminal('3 / Bridge verified state and mint backed COT', 'VerifiedRelay → CotToken.mintVerifiedBatch', [
            f"Approved issuance: {int(lifecycle['mintedCOT']):,} COT", 'Backing: 42,000 verified kg', '',
            'Supply cannot exceed registered backing.', 'Replay: EVENT_ALREADY_PROCESSED',
            'Lost acknowledgment: recover receipt; no second mint.'], footer), 12),
        (terminal('4 / Record garment provenance', 'Fabric: createFinishedProduct', [
            f"Garment: {lifecycle['garment']['id']}",
            f"Manufacturer: {lifecycle['garment']['manufacturer']}",
            f"Source batch: {lifecycle['batchId']}", 'Fabric status: FINISHED', '',
            'Manufacturing records provenance.',
            'It does not automatically redeem COT or release reserve capacity.'], footer), 10),
        (terminal('5 / Mint the garment ProductNFT', 'Fabric NFTMintingRequested → bridge → Ethereum', [
            f"ProductNFT #{lifecycle['nft']['tokenId']}", f"Owner: {lifecycle['nft']['owner']}",
            f"Metadata: {lifecycle['nft']['metadataURI']}", '',
            'Confirmed mint transaction:', lifecycle['nft']['mintTx'],
            'Bridge records the token ID on the Fabric product.'], footer), 12),
        (terminal('6 / Recycle and synchronize both ledgers', 'Ethereum ProductRecycled → bridge → Fabric', [
            f"ProductNFT #{lifecycle['nft']['tokenId']}: recycled = true", '',
            'Confirmed recycling transaction:', lifecycle['recycling']['ethereumTx'], '',
            f"Fabric status: {lifecycle['recycling']['fabricProduct']['status']}",
            'Provenance remains linked. COT backing is unchanged.'], footer), 12),
    ]
    lifecycle_frames = frames/'lifecycle'; lifecycle_frames.mkdir(exist_ok=True)
    lifecycle_slides[0] = (lifecycle_intro(lifecycle), 10)
    lifecycle_slides[0][0].save(ASSETS/'lifecycle-poster.png')
    for index, (slide, _) in enumerate(lifecycle_slides):
        slide.save(lifecycle_frames/f'{index:02}.png')
    encode_story(lifecycle_slides, ASSETS/'cotton-lifecycle.mp4')
    gif_frames = [slide.resize((960,540),Image.Resampling.LANCZOS) for slide, _ in lifecycle_slides[1:]]
    gif_frames[0].save(ASSETS/'cotton-lifecycle.gif',save_all=True,append_images=gif_frames[1:],duration=3500,loop=0,optimize=True)
    print('Rendered two 80-second chaptered videos and GIFs from verified E2E output.')


if __name__=='__main__':main()
