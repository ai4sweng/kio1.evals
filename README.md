# LLM-evals: A Framework for Evaluating Large Language Models

## Getting started with `Promptfoo`

### 1. Installation

####  1.1. Virtual Environment

Create an isolated Python virtual environment so project dependencies do not interfere with system packages. Activate it before installing Python packages.

```sh
python3 -m venv .venv
source .venv/bin/activate
```

#### 1.2. `Node.js`

Promptfoo requires `Node.js` version 20.0.0 or higher:
```sh
# Update package list
sudo apt update

# Install Node.js and npm via NodeSource (recommended for latest versions)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verify installation
node -v
npm -v
```

#### 1.3. `Promptfoo`

Global installation is recommended: this allows for running the `promptfoo` commands from anywhere in the system.
```sh
sudo npm install -g promptfoo
```

Check the version installed:
```sh
promptfoo --version
```

To update to the latest version run the followings command:
```sh
sudo npm install -g promptfoo@latest
```


### 2. Usage

####  2.1. Create evaluation project

Create a folder for your project
```sh
mkdir <YOUR-PROJECT>
cd <YOUR-PROJECT>
```

Initialize a basic setup in a chosen folder. This command creates a promptfooconfig.yaml file. It will guide you through an interactive setup to choose your model providers (OpenAI, Anthropic, Ollama, etc.).
```sh
promptfoo init
```

Your system prompt if any and the test dataset shall be added to this folder.

#### 2.2. Configure the test

Open `promptfooconfig.yaml` in an favorite editor (e.g., nano or VS Code). A basic configuration looks like this:
```sh
prompts:
  - "Summarize this in one sentence: {{text}}"
  - "Give me a 5-word summary of: {{text}}"

providers:
  - openai:gpt-4o
  - anthropic:messages:claude-3-5-sonnet-20240620

tests:
  - vars:
      text: "Promptfoo is an open-source CLI and library for evaluating LLM output quality."
  - vars:
      text: "Ubuntu is a Linux distribution based on Debian and composed mostly of free and open-source software."
```

#### 2.3. Install/Update Ollama:

```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

(Optional) It is a good practice to pull `Ollama` models before running the evaluation, e.g.:
```bash
ollama pull llama3.1:8b
```

Similar alternatives to `llama3.1:8b` are, e.g., `mistral:7b`, `deepseek-r1:8b`, `qwen2.5:7b`, `gemma2:9b`, and `phi3:3.8b`.

#### 2.4. Run the evaluation and view the results

Run the evaluation. `Promptfoo` will call the APIs for each model and prompt combination and display a results table directly in your terminal:
```sh
promptfoo eval
```

You can view the detailed matrix and compare outputs side-by-side. This will start a local web server (usually at `http://localhost:15500`) where you can visually inspect the results, filter tests, and see cost/latency metrics. When using optional parameter `-y`, the web servers opens automatically in a default browser:
```sh
promptfoo view [-y]
```


### 3 Tips

- Sometimes `Promptfoo` caches bad configurations. To clear the cache run:
    ```sh
    promptfoo cache clear
    ```
- If you want to test your prompts for vulnerabilities (jailbreaks, PII leaks), use:
    ```sh
    promptfoo redteam setup
    ```
- `yaml-language-server`: `$schema=https://promptfoo.dev/config-schema.json`
- Learn more about building a configuration [here](https://promptfoo.dev/docs/configuration/guide)


---
