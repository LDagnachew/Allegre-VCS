# PyInstaller spec for the AllegreVCS diff CLI (bundled inside the desktop app).

from PyInstaller.utils.hooks import collect_all

block_cipher = None

music21_datas, music21_binaries, music21_hidden = collect_all("music21")

a = Analysis(
    ["allegrevcs_diff/cli.py"],
    pathex=[],
    binaries=music21_binaries,
    datas=music21_datas,
    hiddenimports=[
        *music21_hidden,
        "allegrevcs_diff",
        "allegrevcs_diff.cli",
        "allegrevcs_diff.diff",
        "allegrevcs_diff.parser",
        "allegrevcs_diff.models",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "matplotlib",
        "pytest",
        "IPython",
        "jupyter",
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="allegrevcs-diff",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
