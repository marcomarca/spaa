import torch

print("PyTorch:", torch.__version__)
print("CUDA disponible:", torch.cuda.is_available())
if torch.cuda.is_available():
    print("GPU:", torch.cuda.get_device_name(0))
    print("CUDA de PyTorch:", torch.version.cuda)
    props = torch.cuda.get_device_properties(0)
    print("VRAM total: %.2f GB" % (props.total_memory / 1024**3))
    print("BF16 soportado:", torch.cuda.is_bf16_supported())
