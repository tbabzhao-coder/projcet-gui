from pathlib import Path
import sys


def main():
    if len(sys.argv) < 3:
        print('usage: copy_cover_closing.py <pages_dir> <theme_assets_dir>')
        raise SystemExit(2)
    pages_dir = Path(sys.argv[1])
    theme_assets = Path(sys.argv[2])
    theme_assets.mkdir(parents=True, exist_ok=True)
    pages = sorted(pages_dir.glob('page_*.png'))
    if not pages:
        raise SystemExit('no pages found')
    cover = pages[0]
    closing = pages[-1]
    (theme_assets / 'cover.png').write_bytes(cover.read_bytes())
    (theme_assets / 'closing.png').write_bytes(closing.read_bytes())
    print('copied cover and closing')


if __name__ == '__main__':
    main()
