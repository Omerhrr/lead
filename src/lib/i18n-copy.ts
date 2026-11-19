// Localized outreach strings for the deterministic engine path (the AI layer
// writes real copy in any of the 30 campaign languages; these templates keep
// the simulation honest when the LLM is unavailable). Languages outside this
// map fall back to English.
export interface LangStrings {
  followup: (firstName: string, reason: string, company: string, isLast: boolean) => string
  followupSubject: (base: string, touchIndex: number) => string
  rePrefix: string
}

const EN = {
  rePrefix: "Re:",
  followupSubject: (base: string, touchIndex: number) =>
    touchIndex === 2 ? `Re: ${base.replace(/^Re:\s*/i, "")}` : "Following up (last one, promise)",
  followup: (firstName: string, reason: string, company: string, isLast: boolean) =>
    `Hi ${firstName}, just floating this back to the top of your inbox - happy to share how similar teams fixed "${reason}" with us.\n\nWorth 15 minutes?${isLast ? `\n\nI'll close the loop on my end either way - good luck with ${company}!` : ""}`,
} satisfies LangStrings

export const LANG_LOCALIZED: Record<string, LangStrings> = {
  English: EN,
  Spanish: {
    rePrefix: "Re:",
    followupSubject: (base, i) => (i === 2 ? `Re: ${base.replace(/^Re:\s*/i, "")}` : "Un seguimiento (última, lo prometo)"),
    followup: (f, r, c, last) =>
      `Hola ${f}, retomo mi mensaje anterior - con gusto comparto cómo equipos similares resolvieron "${r}" con nosotros.\n\n¿Te vienen bien 15 minutos?${last ? `\n\nCierro el tema por mi parte - ¡mucho éxito con ${c}!` : ""}`,
  },
  French: {
    rePrefix: "Re :",
    followupSubject: (base, i) => (i === 2 ? `Re : ${base.replace(/^Re:\s*/i, "")}` : "Petite relance (promis, la dernière)"),
    followup: (f, r, c, last) =>
      `Bonjour ${f}, je remonte mon message au-dessus de votre boîte - avec plaisir de vous montrer comment des équipes similaires ont réglé "${r}" avec nous.\n\n15 minutes ça vous va ?${last ? `\n\nJe clôture de mon côté - bonne continuation avec ${c} !` : ""}`,
  },
  German: {
    rePrefix: "AW:",
    followupSubject: (base, i) => (i === 2 ? `AW: ${base.replace(/^(AW|Re):\s*/i, "")}` : "Kurze Nachfrage (die letzte, versprochen)"),
    followup: (f, r, c, last) =>
      `Hallo ${f}, ich schiebe meine Nachricht nochmal nach oben - gerne zeige ich, wie ähnliche Teams "${r}" mit uns gelöst haben.\n\nWären 15 Minuten drin?${last ? `\n\nIch schließe hiermit ab - viel Erfolg mit ${c}!` : ""}`,
  },
  Portuguese: {
    rePrefix: "Re:",
    followupSubject: (base, i) => (i === 2 ? `Re: ${base.replace(/^Re:\s*/i, "")}` : "Retomando (última, prometo)"),
    followup: (f, r, c, last) =>
      `Olá ${f}, trazendo minha mensagem de volta ao topo - posso mostrar como equipes semelhantes resolveram "${r}" conosco.\n\n15 minutos funciona?${last ? `\n\nPor mim, encerro por aqui - bom trabalho com ${c}!` : ""}`,
  },
  Italian: {
    rePrefix: "Re:",
    followupSubject: (base, i) => (i === 2 ? `Re: ${base.replace(/^Re:\s*/i, "")}` : "Un follow-up (ultimo, prometto)"),
    followup: (f, r, c, last) =>
      `Ciao ${f}, riporto la mia email in cima alla casella - con piacere le mostro come team simili hanno risolto "${r}" con noi.\n\nLe va 15 minuti?${last ? `\n\nChiudo io dal mio lato - buon lavoro con ${c}!` : ""}`,
  },
  Dutch: {
    rePrefix: "Re:",
    followupSubject: (base, i) => (i === 2 ? `Re: ${base.replace(/^Re:\s*/i, "")}` : "Nog een vervolg (de laatste, beloofd)"),
    followup: (f, r, c, last) =>
      `Hoi ${f}, ik zet mijn bericht nog even bovenaan je inbox - ik laat je graag zien hoe vergelijkbare teams "${r}" met ons oplosten.\n\nZitten 15 minuten erin?${last ? `\n\nIk sluit dit zelf af - succes met ${c}!` : ""}`,
  },
  Arabic: {
    rePrefix: "رد:",
    followupSubject: (base, i) => (i === 2 ? `رد: ${base.replace(/^Re:\s*/i, "")}` : "متابعة أخيرة (وعدت)"),
    followup: (f, r, c, last) =>
      `مرحباً ${f}، أعود برسالتي إلى أعلى صندوقك - يسعدني أن أوضح كيف حلت فرق مشابهة "${r}" معنا.\n\nهل يناسبك 15 دقيقة؟${last ? `\n\nأنهي الموضوع من جهتي - بالتوفيق مع ${c}!` : ""}`,
  },
  Japanese: {
    rePrefix: "Re:",
    followupSubject: (base, i) => (i === 2 ? `Re: ${base.replace(/^Re:\s*/i, "")}` : "ご連絡再送（最後になります）"),
    followup: (f, r, c, last) =>
      `${f}さん、先日のメールをもう一度お送りします。同様の課題（${r}）を私たちでどう解決できるかご紹介できればです。\n\n15分ほどお時間いただけますか？${last ? `\n\nなお、今回で連絡は止めます - ${c}さんの今後のご活躍をお祈りしています！` : ""}`,
  },
  "Chinese (Simplified)": {
    rePrefix: "回复：",
    followupSubject: (base, i) => (i === 2 ? `回复：${base.replace(/^Re:\s*/i, "")}` : "再次跟进（最后一次）"),
    followup: (f, r, c, last) =>
      `${f} 您好，把之前的邮件再推到您收件箱顶部 - 很乐意分享类似团队如何用我们解决了"${r}"。\n\n方便聊15分钟吗？${last ? `\n\n我这边就先告一段落 - 祝 ${c} 一切顺利！` : ""}`,
  },
  Russian: {
    rePrefix: "Re:",
    followupSubject: (base, i) => (i === 2 ? `Re: ${base.replace(/^Re:\s*/i, "")}` : "Напоминание (последнее, обещаю)"),
    followup: (f, r, c, last) =>
      `Здравствуйте, ${f}, возвращаю письмо наверх - с радостью покажу, как похожие команды решили «${r}» с нами.\n\nНайдётся 15 минут?${last ? `\n\nС моей стороны закрываю вопрос - удачи с ${c}!` : ""}`,
  },
  Korean: {
    rePrefix: "Re:",
    followupSubject: (base, i) => (i === 2 ? `Re: ${base.replace(/^Re:\s*/i, "")}` : "다시 연락드립니다 (마지막으로)"),
    followup: (f, r, c, last) =>
      `${f}님, 이전 메일을 다시 올려드립니다 - 저희와 비슷한 팀들이 "${r}"를 어떻게 해결했는지 보여드리고 싶습니다.\n\n15분 정도 괜찮으실까요?${last ? `\n\n여기서 마무리할게요 - ${c}의 앞날을 응원합니다!` : ""}`,
  },
}

export function langStrings(language: string | null | undefined): LangStrings {
  return (language && LANG_LOCALIZED[language]) || EN
}
