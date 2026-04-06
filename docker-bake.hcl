variable "TAG" {
  default = "latest"
}

variable "REGISTRY" {
  default = ""
}

group "default" {
  targets = ["chimp"]
}

target "chimp" {
  context = "."
  dockerfile = "Dockerfile"
  tags = [
    notequal("",REGISTRY) ? "${REGISTRY}/circus-chimp:${TAG}" : "circus-chimp:${TAG}",
    notequal("",REGISTRY) ? "${REGISTRY}/circus-chimp:latest" : "circus-chimp:latest"
  ]
  platforms = ["linux/amd64", "linux/arm64"]
}

target "chimp-local" {
  inherits = ["chimp"]
  platforms = []
  output = ["type=docker"]
}
