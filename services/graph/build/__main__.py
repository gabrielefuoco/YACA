"""CLI pubblica: `python -m graph.build --check|--build`."""
from .pipeline import main

if __name__ == '__main__':
    raise SystemExit(main())
