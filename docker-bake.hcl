variable "TAG" {
  default = "latest"
}

variable "REGISTRY" {
  default = ""
}

group "default" {
  targets = ["chimp", "ringmaster", "usher"]
}

target "chimp" {
  context = "."
  target = "chimp"
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

target "ringmaster" {
  context = "."
  dockerfile = "Dockerfile"
  target = "ringmaster"
  tags = [
    notequal("",REGISTRY) ? "${REGISTRY}/circus-ringmaster:${TAG}" : "circus-ringmaster:${TAG}",
    notequal("",REGISTRY) ? "${REGISTRY}/circus-ringmaster:latest" : "circus-ringmaster:latest"
  ]
  platforms = ["linux/amd64", "linux/arm64"]
}

target "ringmaster-local" {
  inherits = ["ringmaster"]
  platforms = []
  output = ["type=docker"]
}

target "usher" {
  context = "."
  dockerfile = "Dockerfile"
  target = "usher"
  tags = [
    notequal("",REGISTRY) ? "${REGISTRY}/circus-usher:${TAG}" : "circus-usher:${TAG}",
    notequal("",REGISTRY) ? "${REGISTRY}/circus-usher:latest" : "circus-usher:latest"
  ]
  platforms = ["linux/amd64", "linux/arm64"]
}

target "usher-local" {
  inherits = ["usher"]
  platforms = []
  output = ["type=docker"]
}
