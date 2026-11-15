; NSIS hooks (tauri.conf.json > bundle.windows.nsis.installerHooks): make .bo files a REMind document with the paper icon.
!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Classes\.bo" "" "REMind.Board"
  WriteRegStr SHCTX "Software\Classes\REMind.Board" "" "REMind board"
  WriteRegStr SHCTX "Software\Classes\REMind.Board\DefaultIcon" "" "$INSTDIR\icons\bo-file.ico"
  WriteRegStr SHCTX "Software\Classes\REMind.Board\shell\open\command" "" `"$INSTDIR\remind.exe" "%1"`
  System::Call "shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegKey SHCTX "Software\Classes\REMind.Board"
  DeleteRegKey SHCTX "Software\Classes\.bo"
  System::Call "shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)"
!macroend
