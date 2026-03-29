{{- define "leaveat.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "leaveat.fullname" -}}
{{- printf "%s" (include "leaveat.name" .) -}}
{{- end -}}

{{- define "leaveat.licenseName" -}}
{{- default "bafgo-leaveat-license" .Values.license.k8sName | trunc 63 | trimSuffix "-" -}}
{{- end -}}
