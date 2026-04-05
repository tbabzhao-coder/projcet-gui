#!/usr/bin/env python3
import argparse
import sys
from pathlib import Path
from pdf_tools import pdf_to_pngs, extract_images, extract_text, summary


def main():
    parser = argparse.ArgumentParser(prog='pdf-tools')
    sub = parser.add_subparsers(dest='cmd')

    p_pdf2png = sub.add_parser('pdf2png')
    p_pdf2png.add_argument('--read_file_path', required=True)
    p_pdf2png.add_argument('--write_folder_path', required=True)
    p_pdf2png.add_argument('--dpi', type=int, default=150)

    p_images = sub.add_parser('extract_images')
    p_images.add_argument('--read_file_path', required=True)
    p_images.add_argument('--write_folder_path', required=True)

    p_text = sub.add_parser('extract_text')
    p_text.add_argument('--read_file_path', required=True)
    p_text.add_argument('--write_folder_path', required=True)

    p_summary = sub.add_parser('metadata')
    p_summary.add_argument('--read_file_path', required=True)

    args = parser.parse_args()
    try:
        if args.cmd == 'pdf2png':
            out = pdf_to_pngs(Path(args.read_file_path), Path(args.write_folder_path), dpi=args.dpi)
            print(out)
        elif args.cmd == 'extract_images':
            out = extract_images(Path(args.read_file_path), Path(args.write_folder_path))
            print(out)
        elif args.cmd == 'extract_text':
            out = extract_text(Path(args.read_file_path), Path(args.write_folder_path))
            print(out)
        elif args.cmd == 'metadata':
            out = summary(Path(args.read_file_path))
            print(out)
        else:
            parser.print_help()
            sys.exit(2)
    except Exception as e:
        print({"error": str(e)})
        sys.exit(1)


if __name__ == '__main__':
    main()
