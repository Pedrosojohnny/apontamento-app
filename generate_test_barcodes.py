import barcode
from barcode.writer import ImageWriter
import os

def generate_barcode(data, filename):
    Code128 = barcode.get_barcode_class('code128')
    # Adicionando margem maior e removendo o texto para evitar confusão na leitura
    writer_options = {
        'write_text': False,
        'quiet_zone': 6.5,
        'module_height': 20.0,
        'module_width': 0.4
    }
    c128 = Code128(data, writer=ImageWriter())
    fullname = c128.save(filename, options=writer_options)
    print(f"Barcode generated: {fullname}")

os.makedirs('test_barcodes', exist_ok=True)

# Generate OM barcodes
oms = ['88234', '88235', '88236']
for om in oms:
    generate_barcode(om, f'test_barcodes/om_{om}')

# Generate Serial Number barcodes
for i in range(1, 11):
    sn = f'SN-BAU-{str(i).zfill(3)}'
    generate_barcode(sn, f'test_barcodes/sn_{str(i).zfill(3)}')
