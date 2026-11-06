"""Shim per i job storici: l'implementazione attiva è `graph.provenance`."""
import importlib as _importlib, sys as _sys
_impl = _importlib.import_module('graph.provenance')
if __name__ == '__main__' and hasattr(_impl, 'main'):
    raise SystemExit(_impl.main())
_sys.modules[__name__] = _impl
