#!/usr/bin/env python3
"""Generate portable deck roles from pinned Radix sRGB data; standard library only."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
RAMPS = json.loads((ROOT / 'resources/colour/radix-3.0.0.json').read_text())
OUTPUT = ROOT / 'apps/macos/Resources/StarterKit/Colour System'

def luminance(value):
    rgb = [int(value[i:i+2], 16) / 255 for i in (1, 3, 5)]
    linear = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    return sum(c * w for c, w in zip(linear, (0.2126, 0.7152, 0.0722)))

def contrast(a, b):
    x, y = sorted((luminance(a), luminance(b)))
    return (y + 0.05) / (x + 0.05)

def choose(candidates, backgrounds, minimum):
    for value in candidates:
        if min(contrast(value, bg) for bg in backgrounds) >= minimum:
            return value
    raise ValueError(('No suitable role', candidates, backgrounds, minimum))

def foreground(fill):
    # Prefer the existing warm inks; fall back to exact black/white if necessary.
    candidates = ['#24171D', '#FFF8EE']
    result = max(candidates, key=lambda value: contrast(value, fill))
    return result if contrast(result, fill) >= 4.5 else max(['#000000', '#FFFFFF'], key=lambda value: contrast(value, fill))

bases = [{
    'id': 'studio', 'label': 'Studio · warm ink & cream',
    'dark': {'background':'#24171D','text':'#FFF8EE','muted':'#C7BBC1','raised':'#3A2832','line':'#917A87'},
    'light': {'background':'#FFF8EE','text':'#24171D','muted':'#6F5B63','raised':'#ECE3D8','line':'#806C75'}
}]
for name, label in [('gray','Neutral · Gray'), ('sand','Warm · Sand'), ('slate','Cool · Slate')]:
    base = {'id':name, 'label':label}
    for mode in ('dark','light'):
        ramp = RAMPS[name + ('Dark' if mode == 'dark' else '')]
        surfaces = [ramp[0], ramp[2]]
        base[mode] = dict(background=ramp[0], text=ramp[11], muted=choose(ramp[10:], surfaces, 4.5), raised=ramp[2], line=choose(ramp[7:], surfaces, 3))
    bases.append(base)
bases.append({'id':'blackwhite','label':'Black & white',
              'dark':{'background':'#000000','text':'#FFFFFF','muted':'#B8B8B8','raised':'#1C1C1C','line':'#777777'},
              'light':{'background':'#FFFFFF','text':'#000000','muted':'#555555','raised':'#F0F0F0','line':'#777777'}})

labels = {'tomato':'Coral · Tomato','blue':'Ocean · Blue','orange':'Sunset · Orange','jade':'Jade Green',
          'grass':'Grass Green','iris':'Iris Blue','sky':'Sky Blue','ruby':'Ruby Red'}
neutrals = {'gray','mauve','slate','sage','olive','sand'}
ordered = ['tomato','red','ruby','crimson','pink','plum','purple','violet','iris','indigo','blue','cyan','teal','jade','green','grass','orange','amber','yellow','lime','mint','sky','brown','bronze','gold','gray','mauve','slate','sage','olive','sand']
families = []
checks = []
for name in ordered:
    family = {'id':name,'label':labels.get(name,name.title()),'group':'Neutral' if name in neutrals else 'Colour','steps':{}}
    for mode in ('dark','light'):
        ramp = RAMPS[name + ('Dark' if mode == 'dark' else '')]
        surfaces = [base[mode][role] for base in bases for role in ('background','raised')]
        family['steps'][mode] = ramp
        family[mode] = dict(text=choose(ramp[8:], surfaces, 4.5), solid=ramp[8], onSolid=foreground(ramp[8]),
                            soft=ramp[2], onSoft=choose(ramp[10:], [ramp[2]], 4.5), line=choose(ramp[7:], surfaces, 3))
        roles = family[mode]
        checks.append({'family':name,'mode':mode,'textOnAllBases':min(contrast(roles['text'], bg) for bg in surfaces),
                       'lineOnAllBases':min(contrast(roles['line'], bg) for bg in surfaces),
                       'onSolid':contrast(roles['onSolid'], roles['solid']),'onSoft':contrast(roles['onSoft'], roles['soft'])})
    families.append(family)

base_checks = []
for base in bases:
    for mode in ('dark','light'):
        values = base[mode]
        for ink, minimum in [('text',7),('muted',4.5),('line',3)]:
            for surface in ('background','raised'):
                ratio = contrast(values[ink], values[surface])
                assert ratio >= minimum, (base['id'],mode,ink,surface,ratio)
                base_checks.append({'base':base['id'],'mode':mode,'ink':ink,'surface':surface,'ratio':ratio,'minimum':minimum})

library = {'schema':'pitchdog-colours/1','version':'1.0.0','colorSpace':'sRGB',
           'source':{'name':'@radix-ui/colors','version':'3.0.0','license':'MIT','ramps':'Unmodified sRGB ramps; deck roles selected for the listed neutral bases.'},
           'defaults':{'base':'studio','accent1':'pink','accent2':'purple','accent3':'blue','accent4':'teal','mono':'gray'},
           'bases':bases,'families':families,
           'usage':{'textMinimum':4.5,'lineMinimum':3,'baseTextMinimum':7,
                    'limits':'Ratios apply to the listed opaque sRGB pairs. Custom values, opacity, images, gradients and other surfaces need their own check. Existing project values stay frozen until Apply.'}}
OUTPUT.mkdir(parents=True, exist_ok=True)
(OUTPUT / 'pitchdog-colours-v1.json').write_text(json.dumps(library,indent=2)+'\n')
proof = {'schema':'pitchdog-colour-contrast/1','result':'passed','families':len(families),'bases':len(bases),
         'minimumFamilyText':min(c['textOnAllBases'] for c in checks),'minimumFamilyLine':min(c['lineOnAllBases'] for c in checks),
         'minimumOnSolid':min(c['onSolid'] for c in checks),'minimumOnSoft':min(c['onSoft'] for c in checks),
         'familyChecks':checks,'baseChecks':base_checks}
(OUTPUT / 'contrast-proof.json').write_text(json.dumps(proof,indent=2)+'\n')
print(json.dumps({k:v for k,v in proof.items() if k not in ('familyChecks','baseChecks')},indent=2))
