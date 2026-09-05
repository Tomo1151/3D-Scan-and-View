"""
Standalone Background Removal Worker.
Runs in an isolated process to prevent OpenMP runtime conflicts between PyTorch and ONNXRuntime.
Uses os._exit to bypass known macOS onnxruntime static recursive_mutex teardown bug (Issue #24579).
"""
import os
import sys
import traceback
from pathlib import Path
from PIL import Image

def process(input_path: str, output_paths: list[str]):
    from rembg import remove
    with Image.open(input_path) as img:
        img = img.convert("RGBA")
        result = remove(img)
        for out_path in output_paths:
            Path(out_path).parent.mkdir(parents=True, exist_ok=True)
            result.save(out_path, "PNG")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python -m app.bg_remover <input_image> <output_image_1> [output_image_2 ...]", file=sys.stderr)
        os._exit(1)
    
    input_file = sys.argv[1]
    output_files = sys.argv[2:]
    try:
        process(input_file, output_files)
        sys.stdout.flush()
        sys.stderr.flush()
        os._exit(0)
    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        sys.stderr.flush()
        os._exit(1)
