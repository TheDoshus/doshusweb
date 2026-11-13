# To learn more about how to use Nix to configure your environment
# see: https://developers.google.com/idx/guides/customize-idx-env
{ pkgs, ... }: {
  # Which nixpkgs channel to use: the newest Firebase Studio builds. Its docs name stable-24.11,
  # stable-25.05 and unstable; stable-26.05 failed to build (2026-11-13), as Studio is sunset
  # (2027-03-22) and gets no new channels. 25.05: Bun 1.2.13, Node 24.11, ffmpeg 7.1.1 with libvmaf.
  channel = "stable-25.05";
  # Use https://search.nixos.org/packages to find packages
  packages = [
    pkgs.nodejs_24    # the newest Node firebase-tools 15 lists in its engines
    pkgs.python3
    pkgs.bun          # the repo's scripts run through bun (bun run check, memes, ...)
    pkgs.ffmpeg-full  # bun run memes:convert: VP9/Opus/WebP encoders + libvmaf
    pkgs.libheif      # heif-convert, for .heic memes ffmpeg can't read
  ];
  # Sets environment variables in the workspace
  env = {};
  idx = {
    # Search for the extensions you want on https://open-vsx.org/ and use "publisher.id"
    extensions = [
      # "vscodevim.vim"
      "google.gemini-cli-vscode-ide-companion"
    ];
    # Enable previews and customize configuration
    previews = {
      enable = true;
      previews = {
        web = {
          # public/ at the addresses Firebase Hosting gives it (clean URLs, its redirects, 404.html): scripts/serve.js
          command = ["bun" "scripts/serve.js" "$PORT" "0.0.0.0"];
          manager = "web";
        };
      };
    };
    # Workspace lifecycle hooks
    workspace = {
      # Runs when a workspace is first created
      onCreate = {
        # Example: install JS dependencies from NPM
        # npm-install = "npm install";
        # Open editors for the following files by default, if they exist:
        default.openFiles = [ "style.css" "main.js" "index.html" ];
      };
      # Runs when the workspace is (re)started
      onStart = {
        # Example: start a background task to watch and re-build backend code
        # watch-backend = "npm run watch-backend";
      };
    };
  };
}