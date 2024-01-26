"use client"
import Head from "next/head";
import { OpenAI } from "openai";
import { ChangeEvent, useState } from "react";

// const {
//   serverRuntimeConfig: { OPENAI_API_KEY },
// } = getConfig();

export default function Home() {
  const [input, setInput] = useState("");
  const [apiResponse, setApiResponse] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const envx=process.env.REACT_APP_OPENAI_API_KEY;
  const APIKEY=process.env.OPENAI_API_KEY;
  console.log("In main ",envx,"=",APIKEY)

  const handleInput = (e: ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };
  const openai = new OpenAI({
    apiKey: APIKEY, dangerouslyAllowBrowser: true
  });
  const generatePost = async () => {
    setIsLoading(true);
    const BASE_PROMPT =
      "Write me a detailed, technical blog post about the following topic: ";
    try {
      (async () => {
        const response = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            {
              "role": "user",
              "content": `${BASE_PROMPT}${input}`
            }
          ],
          temperature: 0.8,
          max_tokens: 2000,
          top_p: 1,
        });
        const output = response.choices.pop()?.message?.content;
        setApiResponse(output ? output.toString() : '');
      })();

    } catch (error) {
      setApiResponse("Something went wrong. Please try again later.");
    }
    setIsLoading(false);
  };
  return (
    <div>
      <Head>
        <title>GPT-3 Blog Writer</title>
      </Head>
      <div className="container mx-auto">
        <div className="container">
          <div className="header mb-6">
            <div className="header-title">
              <h1 className="text-4xl font-bold mt-4">GPT-3 Blog Writer</h1>
            </div>
            <div className="header-subtitle">
              <h2>Easily write blog posts using GPT-3</h2>
            </div>
          </div>
          <div className="prompt-container flex flex-col gap-4 items-end">
            <textarea
              onChange={handleInput}
              value={input}
              placeholder="start typing here"
              className="w-full h-48 bg-slate-900 text-slate-200 p-4 rounded-2xl"
            />
            <button
              className="rounded-full bg-red-600 text-white font-bold px-6 py-4 disabled:opacity-50"
              disabled={isLoading}
              onClick={generatePost}
            >
              {isLoading ? "Loading..." : "Generate"}
            </button>
          </div>
          {apiResponse && (
            <div
              className="response-container mt-6"
              dangerouslySetInnerHTML={{
                __html: apiResponse.replaceAll("\n", "<br />"),
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}