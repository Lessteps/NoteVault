Dim fso, scriptDir, python, run_app
Set fso = CreateObject("Scripting.FileSystemObject")
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)

' Prefer .venv pythonw, then system pythonw
Dim venv_python
venv_python = scriptDir & "\.venv\Scripts\pythonw.exe"
If fso.FileExists(venv_python) Then
    python = venv_python
Else
    python = "pythonw"
End If

run_app = scriptDir & "\run_app.py"
CreateObject("WScript.Shell").Run Chr(34) & python & Chr(34) & " " & Chr(34) & run_app & Chr(34), 0, False
