# Frontend Application

This frontend project aims to enhance the user experience of GPT-Researcher, providing an intuitive and efficient interface for automated research. It offers two deployment options to suit different needs and environments.

## Option 1: Static Frontend (FastAPI)

A lightweight solution using FastAPI to serve static files.

#### Prerequisites
- Python 3.12+
- pip

#### Setup and Running

1. Install required packages:
   ```
   pip install -r requirements.txt
   ```

2. Start the server:
   ```
   python -m uvicorn main:app
   ```

3. Access at `http://localhost:8000`

#### Desktop workspace UI

The static frontend uses `index.html`, `workspace.css`, `workspace.js`, and the
existing research transport in `scripts.js`. It provides a light history sidebar,
collapsed research settings/progress, compact report cards, and a resizable report
reader. Downloads use the Word/PDF/Markdown paths returned by the backend;
unavailable formats stay disabled. History reads the existing Markdown files from
`outputs/`, so those files must be retained.

This version preserves the current report-scoped chat. It does not introduce
automatic research routing or persistent multi-report conversations.

#### UI regression tests

With the server running and Playwright available on the Node module path, run
from the repository root:

```sh
node --check frontend/scripts.js
node --check frontend/workspace.js
node --test tests/frontend/workspace.test.cjs
python -m pytest tests/backend tests/test_websocket_manager.py --timeout=60
```

`GPTR_UI_BASE_URL` overrides the default `http://127.0.0.1:8000`.
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select an existing Chromium executable.
Browser tests intercept research WebSockets before navigation, use an isolated
browser context, and write clearly named fixtures/screenshots under `outputs/`.
They do not call search or model providers. Download fixtures exercise the UI;
they are not evidence of backend document conversion.

PDF conversion additionally requires WeasyPrint's native Pango/GLib libraries.
On Windows, point `WEASYPRINT_DLL_DIRECTORIES` at the directory containing those
DLLs **before starting Python**. See the
[official installation instructions](https://doc.courtbouillon.org/weasyprint/stable/first_steps.html#windows).

#### Demo
https://github.com/assafelovic/gpt-researcher/assets/13554167/dd6cf08f-b31e-40c6-9907-1915f52a7110

## Option 2: NextJS Frontend

A more robust solution with enhanced features and performance.

#### Prerequisites
- Node.js (v18.17.0 recommended)
- npm

#### Setup and Running

1. Navigate to NextJS directory:
   ```
   cd nextjs
   ```

2. Set up Node.js:
   ```
   nvm install 18.17.0
   nvm use v18.17.0
   ```

3. Install dependencies:
   ```
   npm install --legacy-peer-deps
   ```

4. Start development server:
   ```
   npm run dev
   ```

5. Access at `http://localhost:3000`

Note: Requires backend server on `localhost:8000` as detailed in option 1.

#### Demo
https://github.com/user-attachments/assets/092e9e71-7e27-475d-8c4f-9dddd28934a3

## Choosing an Option

- Static Frontend: Quick setup, lightweight deployment.
- NextJS Frontend: Feature-rich, scalable, better performance and SEO.

For production, NextJS is recommended.

## Frontend Features

Our frontend enhances GPT-Researcher by providing:

1. Intuitive Research Interface: Streamlined input for research queries.
2. Real-time Progress Tracking: Visual feedback on ongoing research tasks.
3. Interactive Results Display: Easy-to-navigate presentation of findings.
4. Customizable Settings: Adjust research parameters to suit specific needs.
5. Responsive Design: Optimal experience across various devices.

These features aim to make the research process more efficient and user-friendly, complementing GPT-Researcher's powerful agent capabilities.
