from pathlib import Path
import fitz  # PyMuPDF
import json
import cv2
import numpy as np
from PIL import Image
import pytesseract

# Configure Tesseract path (adjust as needed)
pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'


def pdf_to_pngs(pdf_path: Path, out_dir: Path, dpi: int = 150):
    out_dir = out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(str(pdf_path))
    pages = doc.page_count
    created = []
    zoom = dpi / 72.0
    mat = fitz.Matrix(zoom, zoom)
    pages_dir = out_dir / 'pages'
    pages_dir.mkdir(exist_ok=True)
    for i in range(pages):
        pix = doc.load_page(i).get_pixmap(matrix=mat, alpha=False)
        out_path = pages_dir / f'page_{i+1}.png'
        pix.save(str(out_path))
        created.append(str(out_path))
    return json.dumps({'pages': pages, 'files': created})


def extract_images(pdf_path: Path, out_dir: Path):
    out_dir = out_dir.resolve()
    imgs_dir = out_dir / 'images'
    imgs_dir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(str(pdf_path))
    count = 0
    saved = []
    for i in range(doc.page_count):
        page = doc.load_page(i)
        for img in page.get_images(full=True):
            xref = img[0]
            base_image = doc.extract_image(xref)
            image_bytes = base_image['image']
            ext = base_image.get('ext', 'png')
            fname = imgs_dir / f'image_{count+1}.{ext}'
            with open(fname, 'wb') as fh:
                fh.write(image_bytes)
            saved.append(str(fname))
            count += 1
    return json.dumps({'images': count, 'files': saved})


def extract_text(pdf_path: Path, out_dir: Path):
    out_dir = out_dir.resolve()
    text_dir = out_dir / 'text'
    text_dir.mkdir(parents=True, exist_ok=True)
    doc = fitz.open(str(pdf_path))
    saved = []
    for i in range(doc.page_count):
        page = doc.load_page(i)
        txt = page.get_text()
        fname = text_dir / f'page_{i+1}.txt'
        with open(fname, 'w', encoding='utf-8') as fh:
            fh.write(txt)
        saved.append(str(fname))
    return json.dumps({'pages': doc.page_count, 'files': saved})


def summary(pdf_path: Path):
    doc = fitz.open(str(pdf_path))
    info = doc.metadata
    return json.dumps({'pages': doc.page_count, 'metadata': info})


def extract_pdf_text_with_ocr(pdf_path: Path, output_folder: Path = None, pages_to_read: int = None, start_page: int = 1):
    """
    Extract text from PDF using OCR on page images.
    
    Args:
        pdf_path: Path to the PDF file
        output_folder: Optional folder to save intermediate files (defaults to temp location)
        pages_to_read: Number of pages to process (defaults to all)
        start_page: Starting page number (1-based, defaults to 1)
    
    Returns:
        JSON string with OCR results including confidence scores and page content
    """
    try:
        # Setup output directory
        if output_folder is None:
            output_folder = Path(pdf_path).parent / "temp_ocr_output"
        
        output_folder = Path(output_folder).resolve()
        output_folder.mkdir(parents=True, exist_ok=True)
        pages_dir = output_folder / 'pages'
        pages_dir.mkdir(exist_ok=True)
        
        # Open PDF
        doc = fitz.open(str(pdf_path))
        total_pages = doc.page_count
        
        # Determine page range
        if pages_to_read is None:
            pages_to_read = total_pages
        
        end_page = min(start_page + pages_to_read - 1, total_pages)
        actual_pages = end_page - start_page + 1
        
        results = {
            'pdf_path': str(pdf_path),
            'total_pages': total_pages,
            'pages_processed': actual_pages,
            'start_page': start_page,
            'end_page': end_page,
            'pages': []
        }
        
        # Process each page
        zoom = 2.0  # High resolution for better OCR
        mat = fitz.Matrix(zoom, zoom)
        
        for page_num in range(start_page - 1, end_page):
            try:
                # Convert page to image
                page = doc.load_page(page_num)
                pix = page.get_pixmap(matrix=mat, alpha=False)
                img_path = pages_dir / f'page_{page_num + 1}.png'
                pix.save(str(img_path))
                
                # Load image for OCR processing
                img = cv2.imread(str(img_path))
                
                # Enhance image for better OCR
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                
                # Apply adaptive thresholding
                thresh = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                             cv2.THRESH_BINARY, 11, 2)
                
                # Noise removal
                kernel = np.ones((1,1), np.uint8)
                opening = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
                
                # Convert back to PIL Image for Tesseract
                pil_img = Image.fromarray(opening)
                
                # Perform OCR with detailed data
                ocr_data = pytesseract.image_to_data(pil_img, output_type=pytesseract.Output.DICT, 
                                                   config='--psm 6')
                
                # Extract text and calculate confidence
                page_text_lines = []
                confidences = []
                
                for i in range(len(ocr_data['text'])):
                    text = ocr_data['text'][i].strip()
                    conf = int(ocr_data['conf'][i])
                    
                    if text and conf > 0:  # Only include confident text
                        page_text_lines.append(text)
                        confidences.append(conf)
                
                # Calculate average confidence
                avg_confidence = sum(confidences) / len(confidences) if confidences else 0
                
                # Join text lines
                page_text = '\n'.join(page_text_lines)
                
                page_result = {
                    'page_number': page_num + 1,
                    'confidence': round(avg_confidence, 1),
                    'text_lines': len(page_text_lines),
                    'text': page_text,
                    'readable': len(page_text_lines) > 0,
                    'image_path': str(img_path)
                }
                
                results['pages'].append(page_result)
                
            except Exception as e:
                # Handle individual page errors
                page_result = {
                    'page_number': page_num + 1,
                    'confidence': 0,
                    'text_lines': 0,
                    'text': '',
                    'readable': False,
                    'error': str(e),
                    'image_path': str(img_path) if 'img_path' in locals() else ''
                }
                results['pages'].append(page_result)
        
        doc.close()
        
        # Add summary statistics
        readable_pages = sum(1 for p in results['pages'] if p['readable'])
        total_confidence = sum(p['confidence'] for p in results['pages'])
        avg_confidence = total_confidence / len(results['pages']) if results['pages'] else 0
        
        results['summary'] = {
            'readable_pages': readable_pages,
            'success_rate': round((readable_pages / actual_pages) * 100, 1) if actual_pages > 0 else 0,
            'average_confidence': round(avg_confidence, 1),
            'output_folder': str(output_folder)
        }
        
        return json.dumps(results, indent=2)
        
    except Exception as e:
        error_result = {
            'error': f"OCR processing failed: {str(e)}",
            'pdf_path': str(pdf_path),
            'success': False
        }
        return json.dumps(error_result, indent=2)


def extract_image_text_with_ocr(image_path: str, output_folder: str = None):
    """
    Extract text from image using OCR with advanced preprocessing for small tabular images.
    
    Enhanced with:
    - Multi-scale upsampling for small images
    - Advanced noise removal and denoising
    - Multiple binarization techniques
    - Morphological operations for text enhancement
    - Deskewing and rotation correction
    - Multiple PSM modes for tabular data
    - Confidence-based result selection
    """
    import cv2
    import numpy as np
    from PIL import Image, ImageEnhance
    import pytesseract
    from pathlib import Path
    import json
    
    try:
        # Convert to Path object
        image_path = Path(image_path)
        
        # Setup output directory
        if output_folder is None:
            output_folder = image_path.parent / "temp_image_ocr_output"
        
        output_folder = Path(output_folder).resolve()
        output_folder.mkdir(parents=True, exist_ok=True)
        
        # Read image
        img = cv2.imread(str(image_path))
        if img is None:
            return json.dumps({
                "error": f"Could not read image: {image_path}",
                "success": False
            }, indent=2)
        
        # Get original dimensions
        original_height, original_width = img.shape[:2]
        
        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # STEP 1: Advanced noise removal
        # Bilateral filter to preserve edges while removing noise
        filtered = cv2.bilateralFilter(gray, 9, 75, 75)
        
        # Non-local means denoising for better quality
        denoised = cv2.fastNlMeansDenoising(filtered, h=10)
        
        # STEP 2: Deskewing and rotation correction
        coords = np.column_stack(np.where(denoised > 0))
        if len(coords) > 100:  # Only if sufficient points
            angle = cv2.minAreaRect(coords)[-1]
            if angle < -45:
                angle = -(90 + angle)
            else:
                angle = -angle
            
            # Apply rotation if significant skew detected
            if abs(angle) > 0.5:
                (h, w) = denoised.shape[:2]
                center = (w // 2, h // 2)
                M = cv2.getRotationMatrix2D(center, angle, 1.0)
                denoised = cv2.warpAffine(denoised, M, (w, h), 
                                        flags=cv2.INTER_CUBIC, 
                                        borderMode=cv2.BORDER_REPLICATE)
        
        # STEP 3: Intelligent upscaling for small images
        height, width = denoised.shape
        if width < 1000 or height < 1000:
            # Calculate optimal scale for small tabular images
            target_min_dimension = 1200
            scale_factor = max(2, target_min_dimension / min(width, height))
            
            # Use INTER_CUBIC for best quality upscaling
            scaled = cv2.resize(denoised, None, fx=scale_factor, fy=scale_factor, 
                              interpolation=cv2.INTER_CUBIC)
        else:
            scaled = denoised.copy()
        
        # STEP 4: Advanced binarization pipeline
        binarized_images = []
        
        # Method 1: Adaptive threshold (Gaussian)
        adaptive_gauss = cv2.adaptiveThreshold(
            scaled, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 15, 2
        )
        binarized_images.append(('adaptive_gaussian', adaptive_gauss))
        
        # Method 2: Adaptive threshold (Mean)
        adaptive_mean = cv2.adaptiveThreshold(
            scaled, 255, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, 15, 2
        )
        binarized_images.append(('adaptive_mean', adaptive_mean))
        
        # Method 3: Otsu's automatic thresholding
        _, otsu = cv2.threshold(scaled, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        binarized_images.append(('otsu', otsu))
        
        # Method 4: Combined approach (best of adaptive + otsu)
        combined = cv2.bitwise_and(adaptive_gauss, otsu)
        binarized_images.append(('combined', combined))
        
        # STEP 5: Morphological enhancement
        enhanced_images = []
        
        for name, binary_img in binarized_images:
            # Define kernels for different operations
            dilate_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
            erode_kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (1, 1))
            
            # Dilation to strengthen text
            dilated = cv2.dilate(binary_img, dilate_kernel, iterations=1)
            
            # Erosion to separate touching characters
            enhanced = cv2.erode(dilated, erode_kernel, iterations=1)
            
            # Add white border for better OCR
            border_size = 30
            bordered = cv2.copyMakeBorder(enhanced, border_size, border_size, 
                                        border_size, border_size, 
                                        cv2.BORDER_CONSTANT, value=255)
            
            enhanced_images.append((f'{name}_enhanced', bordered))
        
        # STEP 6: OCR with multiple strategies
        best_result = None
        best_confidence = 0
        all_attempts = []
        
        # PSM modes optimized for different content types
        psm_configs = [
            (6, 'single_block', '--oem 3 --psm 6'),  # Single uniform block
            (8, 'single_word', '--oem 3 --psm 8'),   # Single word
            (13, 'raw_line', '--oem 3 --psm 13'),    # Raw line
            (3, 'full_auto', '--oem 3 --psm 3'),     # Fully automatic
            (4, 'single_column', '--oem 3 --psm 4'), # Single column
            (11, 'sparse_text', '--oem 3 --psm 11'), # Sparse text
        ]
        
        for img_name, processed_img in enhanced_images:
            # Convert to PIL for tesseract
            pil_image = Image.fromarray(processed_img)
            
            # Additional PIL enhancements
            enhancer = ImageEnhance.Contrast(pil_image)
            pil_image = enhancer.enhance(1.3)
            
            enhancer = ImageEnhance.Sharpness(pil_image)
            pil_image = enhancer.enhance(1.2)
            
            for psm_mode, psm_name, config in psm_configs:
                try:
                    # Enhanced character whitelist for better accuracy
                    custom_config = f'{config} -c tessedit_char_whitelist=0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,()[]{{}}:;-_+=/*\|@#$%^&*<>?~` 	
'
                    
                    # Get detailed OCR data
                    data = pytesseract.image_to_data(pil_image, config=custom_config, 
                                                   output_type=pytesseract.Output.DICT)
                    
                    # Process results with quality filtering
                    text_parts = []
                    confidences = []
                    word_boxes = []
                    
                    for i in range(len(data['text'])):
                        confidence = int(data['conf'][i])
                        text = data['text'][i].strip()
                        
                        # More lenient confidence threshold for small text
                        if confidence > 20 and text:
                            text_parts.append(text)
                            confidences.append(confidence)
                            
                            # Store bounding box info for potential structure analysis
                            word_boxes.append({
                                'text': text,
                                'confidence': confidence,
                                'x': data['left'][i],
                                'y': data['top'][i],
                                'w': data['width'][i],
                                'h': data['height'][i]
                            })
                    
                    if confidences:
                        avg_confidence = sum(confidences) / len(confidences)
                        
                        # Structure text better for tables
                        if psm_mode in [4, 6, 13]:  # Modes good for structured text
                            # Try to preserve line structure
                            structured_text = ' '.join(text_parts)
                        else:
                            structured_text = ' '.join(text_parts)
                        
                        attempt = {
                            'method': f'{img_name}_{psm_name}',
                            'text': structured_text,
                            'confidence': round(avg_confidence, 2),
                            'total_words': len(text_parts),
                            'psm_mode': psm_mode,
                            'preprocessing': img_name,
                            'word_count': len(text_parts),
                            'character_count': len(structured_text),
                            'words': word_boxes[:10]  # Sample of word boxes
                        }
                        
                        all_attempts.append(attempt)
                        
                        # Select best result based on confidence and content quality
                        quality_score = avg_confidence
                        if len(text_parts) > 0:
                            quality_score += min(10, len(text_parts))  # Bonus for word count
                        
                        if quality_score > best_confidence:
                            best_confidence = quality_score
                            best_result = attempt
                            
                except Exception as ocr_error:
                    # Log but continue with other methods
                    attempt = {
                        'method': f'{img_name}_{psm_name}',
                        'error': str(ocr_error),
                        'confidence': 0
                    }
                    all_attempts.append(attempt)
        
        # STEP 7: Fallback simple OCR if all enhanced methods fail
        if best_result is None or best_result['confidence'] < 30:
            try:
                # Simple approach as final fallback
                simple_text = pytesseract.image_to_string(gray, config='--oem 3 --psm 6')
                if simple_text.strip():
                    best_result = {
                        'method': 'simple_fallback',
                        'text': simple_text.strip(),
                        'confidence': 25,  # Default moderate confidence
                        'total_words': len(simple_text.split()),
                        'psm_mode': 6,
                        'preprocessing': 'none'
                    }
            except:
                pass
        
        # STEP 8: Final result compilation
        if best_result is None:
            return json.dumps({
                'error': 'All OCR methods failed to extract readable text',
                'image_path': str(image_path),
                'original_dimensions': f'{original_width}x{original_height}',
                'attempts_made': len(all_attempts),
                'success': False
            }, indent=2)
        
        # Compile comprehensive result
        final_result = {
            'success': True,
            'image_path': str(image_path),
            'original_dimensions': f'{original_width}x{original_height}',
            'best_result': best_result,
            'extraction_summary': {
                'total_attempts': len(all_attempts),
                'best_confidence': best_result['confidence'],
                'best_method': best_result['method'],
                'word_count': best_result.get('total_words', 0),
                'character_count': len(best_result['text']),
                'text_preview': best_result['text'][:200] + '...' if len(best_result['text']) > 200 else best_result['text']
            },
            'text': best_result['text'],
            'confidence': best_result['confidence'],
            'all_attempts': all_attempts[:5]  # Top 5 attempts for debugging
        }
        
        return json.dumps(final_result, indent=2)
        
    except ImportError as e:
        return json.dumps({
            'error': f'Required library not installed: {str(e)}',
            'required_libraries': ['opencv-python', 'pillow', 'pytesseract'],
            'success': False
        }, indent=2)
    except Exception as e:
        return json.dumps({
            'error': f'OCR extraction failed: {str(e)}',
            'image_path': str(image_path) if 'image_path' in locals() else 'unknown',
            'success': False
        }, indent=2)