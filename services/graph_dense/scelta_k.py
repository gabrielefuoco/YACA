"""Shim per i job storici: l'implementazione attiva è `graph.build.scelta_k`."""
import importlib as _importlib, sys as _sys
_impl = _importlib.import_module('graph.build.scelta_k')
if __name__ == '__main__' and hasattr(_impl, 'main'):
    raise SystemExit(_impl.main())
_sys.modules[__name__] = _impl
