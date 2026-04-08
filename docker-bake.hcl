variable "TAG" {
  default = "latest"
}

variable "REGISTRY" {
  default = ""
}

variable "IMAGE_NAME" {
  default = ""
}

variable "PUSH" {
  default = false
}

group "default" {
  targets = ["chimp", "ringmaster", "usher", "bullhorn"]
}

# Common target with shared configuration
target "docker-metadata-action" {}

target "common" {
  context = "."
  dockerfile = "Dockerfile"
  platforms = ["linux/amd64", "linux/arm64"]
}

target "chimp" {
  inherits = ["common", "docker-metadata-action"]
  target = "chimp"
  cache-from = ["type=gha,scope=chimp"]
  cache-to = ["type=gha,mode=max,scope=chimp"]
  output = [PUSH ? "type=registry" : "type=docker"]
}

target "chimp-local" {
  inherits = ["chimp"]
  platforms = []
  output = ["type=docker"]
  tags = ["circus-chimp:${TAG}"]
}

target "ringmaster" {
  inherits = ["common", "docker-metadata-action"]
  target = "ringmaster"
  cache-from = ["type=gha,scope=ringmaster"]
  cache-to = ["type=gha,mode=max,scope=ringmaster"]
  output = [PUSH ? "type=registry" : "type=docker"]
}

target "ringmaster-local" {
  inherits = ["ringmaster"]
  platforms = []
  output = ["type=docker"]
  tags = ["circus-ringmaster:${TAG}"]
}

target "usher" {
  inherits = ["common", "docker-metadata-action"]
  target = "usher"
  cache-from = ["type=gha,scope=usher"]
  cache-to = ["type=gha,mode=max,scope=usher"]
  output = [PUSH ? "type=registry" : "type=docker"]
}

target "usher-local" {
  inherits = ["usher"]
  platforms = []
  output = ["type=docker"]
  tags = ["circus-usher:${TAG}"]
}

target "bullhorn" {
  inherits = ["common", "docker-metadata-action"]
  target = "bullhorn"
  cache-from = ["type=gha,scope=bullhorn"]
  cache-to = ["type=gha,mode=max,scope=bullhorn"]
  output = [PUSH ? "type=registry" : "type=docker"]
}

target "bullhorn-local" {
  inherits = ["bullhorn"]
  platforms = []
  output = ["type=docker"]
  tags = ["circus-bullhorn:${TAG}"]
}
