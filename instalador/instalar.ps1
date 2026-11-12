# Instala o plugin medidor-de-uso no Claude Code do usuario atual.
# O instalador .msi roda este script depois de copiar os arquivos; tambem pode ser rodado a mao.
param([switch]$Desinstalar)

Add-Type -AssemblyName System.Windows.Forms
$titulo = 'Medidor de uso para Claude Code'

function Aviso($texto, $icone) {
    [System.Windows.Forms.MessageBox]::Show($texto, $titulo, 'OK', $icone) | Out-Null
}

# Procura o Claude Code: no PATH, na instalacao nativa, no npm e dentro do app desktop.
function Achar-Claude {
    $cmd = Get-Command claude -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $fixos = @(
        "$env:USERPROFILE\.local\bin\claude.exe",
        "$env:APPDATA\npm\claude.cmd",
        "$env:LOCALAPPDATA\Programs\claude\claude.exe"
    )
    foreach ($caminho in $fixos) { if (Test-Path $caminho) { return $caminho } }
    # O app desktop guarda o Claude Code em pastas com a versao no nome; usa o mais recente.
    $achados = Get-ChildItem "$env:LOCALAPPDATA\Claude*", "$env:LOCALAPPDATA\AnthropicClaude*" -Directory -ErrorAction SilentlyContinue |
        ForEach-Object { Get-ChildItem $_.FullName -Recurse -Filter claude.exe -ErrorAction SilentlyContinue -Depth 5 } |
        Sort-Object LastWriteTime -Descending
    if ($achados) { return $achados[0].FullName }
    return $null
}

$claude = Achar-Claude
if (-not $claude) {
    if (-not $Desinstalar) {
        Aviso "O Claude Code nao foi encontrado neste computador.`n`nInstale primeiro em https://claude.com/claude-code e depois rode este instalador de novo." 'Warning'
    }
    exit 0
}

if ($Desinstalar) {
    & $claude plugin uninstall medidor-de-uso@mods-wercely --scope user 2>&1 | Out-Null
    exit 0
}

$saida = @()
$saida += & $claude plugin marketplace add wercelyduarte/medidor-de-uso 2>&1
$saida += & $claude plugin install medidor-de-uso@mods-wercely --scope user 2>&1
$texto = ($saida | Out-String)

if ($texto -match 'Successfully installed|already installed|ja esta instalado') {
    Aviso "Pronto! O medidor de uso foi instalado.`n`nAbra uma nova sessao no Claude Code para ver a linha de consumo acima da caixa de mensagem.`nPara abrir o painel, digite /consumo." 'Information'
} else {
    Aviso "A instalacao nao terminou. Mensagem do Claude Code:`n`n$texto" 'Error'
}
exit 0
