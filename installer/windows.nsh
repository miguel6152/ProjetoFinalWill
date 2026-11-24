!macro customInstall
  CreateDirectory "$SMPROGRAMS\Sistema de Academia"
  CreateShortCut "$SMPROGRAMS\Sistema de Academia\Preparar demonstração.lnk" "$INSTDIR\Sistema de Academia.exe" "--preparar-demo" "$INSTDIR\Sistema de Academia.exe" 0
  CreateShortCut "$SMPROGRAMS\Sistema de Academia\Abrir demonstração.lnk" "$INSTDIR\Sistema de Academia.exe" "--demo" "$INSTDIR\Sistema de Academia.exe" 0
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\Sistema de Academia\Preparar demonstração.lnk"
  Delete "$SMPROGRAMS\Sistema de Academia\Abrir demonstração.lnk"
!macroend
