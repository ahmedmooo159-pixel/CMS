from PIL import Image

# Open the original logo
try:
    img = Image.open('logo.png')
    
    # Calculate new width while maintaining aspect ratio, targeting height of 100px
    target_height = 100
    aspect_ratio = img.width / img.height
    new_width = int(target_height * aspect_ratio)
    
    # Resize the image
    img_resized = img.resize((new_width, target_height), Image.Resampling.LANCZOS)
    
    # Save optimized png
    img_resized.save('logo_sm.png', optimize=True, quality=85)
    print("Optimization successful. Saved as logo_sm.png")
except Exception as e:
    print(f"Error: {e}")
