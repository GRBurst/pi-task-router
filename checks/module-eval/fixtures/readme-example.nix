{
  # pi-setup's patched subagent runner: the router routes through its
  # spawn-policy API.
  programs.pi.actorSubagents.enable = true;
  programs.piTaskRouter = {
    enable = true;
    # Optional: a local model server, with a pi provider named `llama` in
    # your models.json. Without one answering on `health`, the router
    # routes on to the next member.
    settings.models."qwen-local" = {
      model = "llama/qwen3.8";
      health = "http://localhost:11545";
    };
  };
}
