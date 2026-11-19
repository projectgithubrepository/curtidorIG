export async function createComment(caption) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Configure OPENAI_API_KEY no arquivo .env para gerar comentários.");
  }

  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.8,
      messages: [
        {
          role: "system",
          content: "Escreva um comentário curto, natural e específico em português brasileiro para a publicação descrita. Comente apenas algo sustentado pela legenda. Não invente experiências pessoais, não faça propaganda, não use hashtags, não repita frases genéricas e não use emojis em excesso. Retorne somente o comentário."
        },
        { role: "user", content: caption.slice(0, 5000) }
      ]
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Falha ao gerar comentário (HTTP ${response.status}): ${body.slice(0, 300)}`);
  }
  const data = await response.json();
  const comment = data.choices?.[0]?.message?.content?.trim();
  if (!comment) throw new Error("A IA não retornou um comentário.");
  return comment.replace(/^["“]|["”]$/g, "").slice(0, 500);
}
