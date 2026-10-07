!macro NSIS_HOOK_POSTINSTALL
  ; Ensure working directory is set to installation folder
  SetOutPath "$INSTDIR"
  
  ; Reliably create/update Start Menu shortcut pointing to main executable
  CreateShortcut "$SMPROGRAMS\Kairo.lnk" "$INSTDIR\kairo-desktop.exe" "" "$INSTDIR\kairo-desktop.exe" 0 "" "" "Kairo Deal Intelligence"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  Delete "$SMPROGRAMS\Kairo.lnk"
  Delete "$DESKTOP\Kairo.lnk"
!macroend
