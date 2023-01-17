const dotenv = require("dotenv");
const cheerio = require("cheerio");
const { default: axios } = require("axios");
const fs = require("fs");
const { spawn } = require("child_process");

dotenv.config();

function sanitizeText(str) {
    return ` ${str.replace(/\n/g, " ").trim()}\n`;
}

async function fetchAndParseToPromptsJson(
    siteUrl,
    containerClass,
    headerClass,
    answerClass,
    limit
) {
    const response = await axios.get(siteUrl);
    const html = response.data;
    const $ = cheerio.load(html);
    const prompts = [];

    $(containerClass).each((i, el) => {
        if (i + 1 >= limit) return;
        const prompt = sanitizeText($(el).find(headerClass).text());
        const completion = sanitizeText($(el).find(answerClass).text());
        prompts.push({ prompt, completion });
    });

    return prompts;
}

async function saveFileToDisk(fileName, data) {
    let res, rej;
    const promise = new Promise((resolve, reject) => {
        res = resolve;
        rej = reject;
    });
    fs.writeFile(fileName, JSON.stringify(data, null, 2), (err) => {
        if (err) rej(err);
        res();
    });
    return promise;
}

async function runOpenAICli(fileName, modelName) {
    try {
        console.log("Running OpenAI CLI...");
        console.log("Ensure the API key is configured!");
        console.log("Follow along the open ai cli prompts!");
        const proc = spawn("openai", ["tools", "fine_tunes.prepare_data", "-f", "prompts.json"], { stdio: "inherit" });
        proc.on("exit", (code) => {
            if (code === 0) {
				const fileSplit = fileName.split(".");
				const finalFileName = `${fileSplit[0]}_prepared.jsonl`;
				const proc2 = spawn('openai', ['api', 'fine_tunes.create', '-t', finalFileName, '-m', modelName], { stdio: 'inherit' });
                proc2.on("exit", (code) => {
					if (code === 0) {
						console.log("Training complete!");
						console.log("Please note the model id");
					} else {
						console.log("Error in running openai cli");
					}
				});
            } else {
                console.log("Error in running openai cli");
            }
        });
    } catch (e) {
        console.log("Error in running OpenAI CLI");
    }
}

(async () => {
    const prompts = await fetchAndParseToPromptsJson(
        process.env.SITE_URL,
        `.${process.env.CONTAINER}`,
        `.${process.env.HEADER}`,
        `.${process.env.CONTENT}`,
        10
    );
    await saveFileToDisk("prompts.json", prompts);
    await runOpenAICli(
        "prompts.json",
        process.env.DEFAULT_MODEL || "davinci",
    );
})();
