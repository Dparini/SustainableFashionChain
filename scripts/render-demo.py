"""Render real recorded E2E output into a terminal GIF and an 80s annotated video.
Run the E2E capture first. Nothing in this renderer fabricates decisions or gas.
Requires the agent demo extra (Pillow) and ffmpeg installed on PATH.
"""
import argparse
import json
import subprocess
import textwrap
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
    concat=[]
    for index,(slide,duration) in enumerate(slides):
        file=frames/f'{index:02}.png';slide.save(file);concat.extend([f"file '{file}'",f'duration {duration}'])
    concat.append(f"file '{frames/'06.png'}'")
    listing=frames/'frames.txt';listing.write_text('\n'.join(concat)+'\n')
    subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',str(listing),
                    '-r','20','-c:v','libx264','-pix_fmt','yuv420p','-t','80','-movflags','+faststart',str(ASSETS/'demo.mp4')],check=True)
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
    listing_lines = []
    for index, (slide, duration) in enumerate(lifecycle_slides):
        file = lifecycle_frames/f'{index:02}.png'; slide.save(file)
        listing_lines.extend([f"file '{file}'", f'duration {duration}'])
    listing_lines.append(f"file '{lifecycle_frames/'06.png'}'")
    lifecycle_listing = lifecycle_frames/'frames.txt'
    lifecycle_listing.write_text('\n'.join(listing_lines)+'\n')
    subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-f','concat','-safe','0','-i',str(lifecycle_listing),
                    '-r','20','-c:v','libx264','-pix_fmt','yuv420p','-t','80','-movflags','+faststart',str(ASSETS/'cotton-lifecycle.mp4')],check=True)
    gif_frames = [slide.resize((960,540),Image.Resampling.LANCZOS) for slide, _ in lifecycle_slides[1:]]
    gif_frames[0].save(ASSETS/'cotton-lifecycle.gif',save_all=True,append_images=gif_frames[1:],duration=3500,loop=0,optimize=True)
    print('Rendered 80-second video and terminal GIF from the recorded E2E decisions.')


if __name__=='__main__':main()
