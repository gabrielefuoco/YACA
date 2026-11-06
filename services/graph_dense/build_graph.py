"""Shim legacy. Il comando canonico V45 è `PYTHONPATH=services py -m graph.build`."""
import importlib as _importlib, sys as _sys
_impl = _importlib.import_module('graph.build.pipeline')
if __name__ == '__main__':
    raise SystemExit(_impl.main())
_sys.modules[__name__] = _impl
