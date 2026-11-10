from PIL import Image
import os
import numpy as np

folder = r'c:\Proyect\whatsapp-agent\stickers'

slug_map = {
    'radio': 'perucho_radio',
    'cinta': 'perucho_midiendo',
    'despide': 'perucho_despedida',
    'maestro': 'perucho_maestro',
    'mascota': 'perucho_mascota'
}

target_size = 512
padding = 16
max_content_size = target_size - 2 * padding  # 480

results = []

for f in sorted(os.listdir(folder)):
    if f.lower().endswith('.png'):
        base_name = os.path.splitext(f)[0]
        p = os.path.join(folder, f)
        im = Image.open(p)
        arr = np.array(im)

        # Clean stray alpha noise near borders (threshold < 5)
        arr[arr[:, :, 3] < 5, 3] = 0

        # Find real content bbox
        mask = arr[:, :, 3] > 0
        coords = np.argwhere(mask)
        y0, x0 = coords.min(axis=0)
        y1, x1 = coords.max(axis=0) + 1

        cropped = Image.fromarray(arr[y0:y1, x0:x1])

        # Scale proportionally to fit inside 480x480
        w, h = cropped.size
        scale = min(max_content_size / w, max_content_size / h)
        new_w = int(round(w * scale))
        new_h = int(round(h * scale))

        resized = cropped.resize((new_w, new_h), Image.Resampling.LANCZOS)

        # Create transparent canvas 512x512
        final_im = Image.new('RGBA', (target_size, target_size), (0, 0, 0, 0))
        offset_x = (target_size - new_w) // 2
        offset_y = (target_size - new_h) // 2
        final_im.paste(resized, (offset_x, offset_y))

        # Save as matching .webp
        out_name = f'{base_name}.webp'
        out_path = os.path.join(folder, out_name)
        final_im.save(out_path, 'WEBP', quality=90, method=6)

        # Also save slug version for cleaner code / API references
        slug = None
        for k, v in slug_map.items():
            if k in base_name.lower():
                slug = v
                break
        if not slug:
            slug = base_name.lower().replace(' ', '_').replace(',', '')

        slug_path = os.path.join(folder, f'{slug}.webp')
        final_im.save(slug_path, 'WEBP', quality=90, method=6)

        results.append({
            'original': f,
            'slug': f'{slug}.webp',
            'size_kb': round(os.path.getsize(out_path) / 1024, 1),
            'dimensions': f'{target_size}x{target_size}'
        })

print("CONVERSION_COMPLETE")
for r in results:
    print(f"- {r['original']} -> {r['slug']} ({r['size_kb']} KB, {r['dimensions']})")
