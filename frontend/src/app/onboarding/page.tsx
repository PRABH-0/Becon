"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bot, User, ArrowRight, Sparkles } from "lucide-react";
import { useLoader } from "@/context/LoadingContext";

const API = (process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { showLoader } = useLoader();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(true);
  const [onboardingComplete, setOnboardingComplete] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Initial welcome message from system to start the flow
    startOnboarding();
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const startOnboarding = async () => {
    // We send an initial empty/hidden system message to trigger the AI to ask the first question
    await sendChat([{ role: "system", content: "User has just registered. Start the onboarding." }]);
  };

  const sendChat = async (chatHistory: ChatMessage[]) => {
    setIsTyping(true);
    const token = localStorage.getItem("becon_token");
    if (!token) {
      router.push("/login");
      return;
    }

    try {
      const res = await fetch(`${API}/api/onboarding/chat`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ messages: chatHistory })
      });

      if (res.ok) {
        const data = await res.json();
        setMessages([...chatHistory, { role: "assistant", content: data.reply_text }]);
        if (data.onboarding_complete) {
          setOnboardingComplete(true);
          setTimeout(() => {
            showLoader(
              "Finalizing Your AI Topic Stack...",
              "Configuring your morning intelligence gazette & action cards..."
            );
            router.push("/profile");
          }, 3000);
        }
      } else {
        setMessages([...chatHistory, { role: "assistant", content: "I'm having trouble connecting to my servers right now." }]);
      }
    } catch (err) {
      setMessages([...chatHistory, { role: "assistant", content: "Network error. Please try again." }]);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;

    const userMessage: ChatMessage = { role: "user", content: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput("");
    
    await sendChat(newMessages);
  };

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-slate-800 font-sans flex flex-col">
      {/* Header */}
      <header className="bg-slate-950 text-slate-200 py-4 px-6 border-b border-slate-800 shadow-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-2xl font-black tracking-widest text-white uppercase flex items-center gap-2">
              <Bot className="text-rose-500" /> B E C O N <span className="font-mono text-xs text-slate-400 bg-slate-900 px-2 py-0.5 rounded ml-2 hidden sm:inline">AI ONBOARDING</span>
            </h1>
          </div>
          {onboardingComplete && (
            <div className="text-emerald-400 font-mono text-xs font-bold flex items-center gap-1.5 animate-pulse">
              <Sparkles className="w-4 h-4" /> PROFILE COMPLETE
            </div>
          )}
        </div>
      </header>

      {/* Chat Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 overflow-hidden flex flex-col relative">
        <div className="flex-1 overflow-y-auto pr-2 space-y-6 pb-4">
          
          {messages.filter(m => m.role !== "system").map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] sm:max-w-[75%] rounded-2xl p-4 shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-indigo-600 text-white rounded-tr-sm' 
                  : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-md'
              }`}>
                {msg.role !== 'user' && (
                  <div className="flex items-center gap-2 mb-1.5 border-b border-slate-100 pb-1.5">
                    <Bot className="w-4 h-4 text-rose-500" />
                    <span className="text-[10px] font-black font-mono tracking-widest text-slate-400 uppercase">Becon AI</span>
                  </div>
                )}
                <div className="text-sm font-medium leading-relaxed whitespace-pre-wrap">
                  {msg.content}
                </div>
              </div>
            </div>
          ))}

          {isTyping && (
            <div className="flex justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm p-4 shadow-md flex items-center gap-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
                <span className="text-xs font-mono font-bold text-slate-400">Becon AI is thinking...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="pt-4 bg-[#FAF8F5] sticky bottom-0">
          <form onSubmit={handleSend} className="relative flex items-center">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isTyping || onboardingComplete}
              placeholder={onboardingComplete ? "Redirecting to your profile..." : "Type your answer..."}
              className="w-full bg-white border-2 border-slate-300 focus:border-indigo-600 rounded-xl pl-4 pr-14 py-4 text-slate-900 font-semibold shadow-lg transition-colors outline-none disabled:bg-slate-100 disabled:text-slate-400"
            />
            <button
              type="submit"
              disabled={isTyping || !input.trim() || onboardingComplete}
              className="absolute right-2 bg-indigo-600 hover:bg-indigo-500 text-white w-10 h-10 rounded-lg flex items-center justify-center transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md cursor-pointer"
            >
              <ArrowRight className="w-5 h-5" />
            </button>
          </form>
          <div className="text-center mt-3 text-[10px] font-mono text-slate-400 font-bold tracking-widest uppercase">
            Powered by Becon AI Intelligence
          </div>
        </div>
      </main>
    </div>
  );
}
