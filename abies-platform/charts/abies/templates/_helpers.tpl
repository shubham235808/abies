{{- define "abies.fullname" -}}
{{- default .Release.Name .Values.fullnameOverride | trunc 50 | trimSuffix "-" -}}
{{- end -}}
{{- define "abies.labels" -}}
app.kubernetes.io/name: abies
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}
{{- define "abies.selector" -}}
app.kubernetes.io/name: abies
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
