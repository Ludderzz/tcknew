import { useState, useEffect } from "react";
import { useSupabaseAuth } from "@/contexts/SupabaseAuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useLocation } from "wouter";
import { Crown, AlertCircle, Home, ShieldCheck, History, Calendar, Users, Eye, EyeOff, Ticket, BarChart3, Loader2, ListOrdered, FileSpreadsheet, DownloadCloud, Trash2, Facebook, ExternalLink, Upload, FileText } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { trpc } from "@/lib/trpc";
import ClassicDraw from "@/components/draw/ClassicDraw";
import SpinWheel from "@/components/draw/SpinWheel";
import HorseRace from "@/components/draw/HorseRace";
import EntryListModal from "@/components/draw/EntryListModal";

export default function DrawArea() {
  const { user, isAdmin, loading } = useSupabaseAuth();
  const [, setLocation] = useLocation();
  const [activeMode, setActiveMode] = useState<"classic" | "wheel" | "race" | null>(null);
  
  // Selected competition target for the classic draw modal
  const [selectedCompTarget, setSelectedCompTarget] = useState<{ id: string; title: string } | null>(null);
  
  // Entry List Modal State
  const [isEntryListOpen, setIsEntryListOpen] = useState(false);

  // Scraper Trigger State
  const [scraperUrl, setScraperUrl] = useState("");
  const scrapeEntriesMutation = trpc.draw.importEntries.useMutation();

  // Facebook Picker State
  const [fbCommentsText, setFbCommentsText] = useState("");
  const [fbCompTitle, setFbCompTitle] = useState("");
  const [fbResult, setFbResult] = useState<any>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const saveFacebookDrawMutation = trpc.draw.saveFacebookExtensionDraw.useMutation();

  // Imported Competitions List State
  const [importedCompetitions, setImportedCompetitions] = useState<any[]>([]);
  const [isImportsLoading, setIsImportsLoading] = useState(false);
  
  // Live Date and Time State
  const [currentDateTime, setCurrentDateTime] = useState(new Date());

  // Historical Audit Trail States
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [isLogsLoading, setIsLogsLoading] = useState(false);
  
  // Inline Winner Pagination State
  const [winnerPage, setWinnerPage] = useState(1);
  const WINNERS_PER_PAGE = 10;

  // Deletion Confirmation Modal State
  const [deleteTargetComp, setDeleteTargetComp] = useState<{ id: string; title: string } | null>(null);
  const [isCheckingDrawStatus, setIsCheckingDrawStatus] = useState(false);
  const [hasBeenDrawn, setHasBeenDrawn] = useState(false);
  const [isDeletingComp, setIsDeletingComp] = useState(false);

  // Helper to request higher resolution Facebook images from CDN
  const getHighResFbAvatar = (url: string | undefined) => {
    if (!url) return "";
    return url
      .replace(/\/s\d+x\d+\//, "/s300x300/")
      .replace(/\/p\d+x\d+\//, "/p300x300/")
      .replace(/width=\d+/, "width=300")
      .replace(/height=\d+/, "height=300");
  };

  // Drag and Drop File Handlers
  const handleFileRead = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      setFbCommentsText(content);
      setFileName(file.name);
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      handleFileRead(file);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileRead(e.target.files[0]);
    }
  };

  // Set up live clock ticker
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch past competition configurations and imported comps on mount
  useEffect(() => {
    if (user && isAdmin) {
      fetchAuditLogs();
      fetchImportedCompetitions();
    }
  }, [user, isAdmin]);

  const fetchAuditLogs = async () => {
    setIsLogsLoading(true);
    try {
      const { data, error } = await supabase
        .from("draws_audit")
        .select("*")
        .order("timestamp", { ascending: false });

      if (error) throw error;
      setAuditLogs(data || []);
    } catch (err) {
      console.error("Failed to parse draws audit sequence:", err);
    } finally {
      setIsLogsLoading(false);
    }
  };

  const fetchImportedCompetitions = async () => {
    setIsImportsLoading(true);
    try {
      const { data, error } = await supabase
        .from("competition_entries")
        .select("competition_id, competition_title, created_at")
        .order("created_at", { ascending: false });

      if (error) throw error;

      const uniqueCompsMap = new Map();
      (data || []).forEach((item, index) => {
        const uniqueKey = item.competition_id || item.competition_title || `comp_fallback_${index}`;
        if (!uniqueCompsMap.has(uniqueKey)) {
          uniqueCompsMap.set(uniqueKey, { ...item, _uniqueKey: uniqueKey });
        }
      });

      setImportedCompetitions(Array.from(uniqueCompsMap.values()));
    } catch (err) {
      console.error("Failed to fetch imported competitions from Supabase:", err);
    } finally {
      setIsImportsLoading(false);
    }
  };

  const handleLogToggle = (logId: string) => {
    if (selectedLogId === logId) {
      setSelectedLogId(null);
    } else {
      setSelectedLogId(logId);
      setWinnerPage(1);
    }
  };

  // Check if competition has been drawn and open deletion modal
  const handleInitiateDelete = async (comp: { competition_id: string; competition_title: string }) => {
    const compId = comp.competition_id;
    const compTitle = comp.competition_title || compId;

    setDeleteTargetComp({ id: compId, title: compTitle });
    setIsCheckingDrawStatus(true);
    setHasBeenDrawn(false);

    try {
      const { data, error } = await supabase
        .from("draws_audit")
        .select("draw_id")
        .or(`competition_title.ilike.%${compTitle}%,competition_id.eq.${compId}`)
        .limit(1);

      if (error) throw error;

      setHasBeenDrawn(data && data.length > 0);
    } catch (err) {
      console.error("Failed to check draw audit status:", err);
      setHasBeenDrawn(false);
    } finally {
      setIsCheckingDrawStatus(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTargetComp) return;

    setIsDeletingComp(true);
    try {
      let query = supabase.from("competition_entries").delete();
      
      if (deleteTargetComp.id) {
        query = query.eq("competition_id", deleteTargetComp.id);
      } else {
        query = query.eq("competition_title", deleteTargetComp.title);
      }

      const { error } = await query;
      if (error) throw error;

      alert("Competition entries successfully deleted.");
      setDeleteTargetComp(null);
      fetchImportedCompetitions();
    } catch (err: any) {
      console.error("Failed to delete competition entries:", err);
      alert(`Deletion failed: ${err.message || "Unknown error"}`);
    } finally {
      setIsDeletingComp(false);
    }
  };

  const handleRunScraper = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scraperUrl.trim()) return;

    try {
      const result = await scrapeEntriesMutation.mutateAsync({
        competitionUrl: scraperUrl.trim(),
      });
      
      if (result && typeof result === "object") {
        const entriesPayload = (result as any).entries || (result as any).data;
        const compId = (result as any).competitionId || `comp_${Date.now()}`;
        const compTitle = (result as any).competitionTitle || scraperUrl.trim();

        if (Array.isArray(entriesPayload) && entriesPayload.length > 0) {
          const formattedRows = entriesPayload.map((entry: any) => ({
            competition_id: compId,
            competition_title: compTitle,
            participant_name: entry.participantName || entry.Name || entry.username || "Anonymous",
            ticket_number: entry.ticketNumber != null ? String(entry.ticketNumber) : (entry.Ticket != null ? String(entry.Ticket) : null),
          }));

          const CHUNK_SIZE = 500;
          for (let i = 0; i < formattedRows.length; i += CHUNK_SIZE) {
            const chunk = formattedRows.slice(i, i + CHUNK_SIZE);
            const { error: insertError } = await supabase
              .from("competition_entries")
              .insert(chunk);

            if (insertError) throw insertError;
          }
        }
      }

      alert("Scraper successfully executed and entries saved to Supabase!");
      setScraperUrl("");
      fetchImportedCompetitions();
    } catch (err: any) {
      console.error("Scraper execution or Supabase sync failed:", err);
      alert(`Scraper failed: ${err.message || "Unknown error"}`);
    }
  };

  // ENHANCED FACEBOOK PICKER HANDLER (Supports flexible JSON formats + multi-delimiter text)
  const handleRunFbPicker = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawInput = fbCommentsText.trim();
    if (!rawInput) return;

    let parsedCommentsPayload: any[] = [];

    // 1. Try JSON Parsing
    try {
      const jsonData = JSON.parse(rawInput);
      const items = Array.isArray(jsonData)
        ? jsonData
        : jsonData.comments || jsonData.data || jsonData.items || [jsonData];

      if (Array.isArray(items) && items.length > 0) {
        parsedCommentsPayload = items.map((item: any) => {
          if (typeof item === "string") return item;

          // Normalize object fields across various scrapers/extensions
          return {
            participantName:
              item.participantName ||
              item.name ||
              item.author ||
              item.authorName ||
              item.user_name ||
              item.userName ||
              item.full_name ||
              item.profileName ||
              item.user?.name ||
              item.user?.full_name ||
              "Anonymous",
            message:
              item.message ||
              item.comment ||
              item.text ||
              item.comment_text ||
              item.commentText ||
              item.message_text ||
              item.body ||
              item.content ||
              "",
            avatarUrl:
              item.avatarUrl ||
              item.avatar ||
              item.profilePicture ||
              item.user?.avatar ||
              "",
            profileUrl:
              item.profileUrl ||
              item.profile ||
              item.authorUrl ||
              item.user?.profileUrl ||
              "",
          };
        });
      }
    } catch (jsonErr) {
      // Not valid JSON, fall through to text parsing
    }

    // 2. Line-by-Line Parsing Fallback (Supports ":" "-" "|")
    if (parsedCommentsPayload.length === 0) {
      const lines = rawInput
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      parsedCommentsPayload = lines.map((line) => {
        // Look for common separators: ":", "-", "|"
        const delimiterMatch = line.match(/^([^:\-\|]+)[:\-\|]\s*(.+)$/);
        if (delimiterMatch) {
          return {
            participantName: delimiterMatch[1].trim(),
            message: delimiterMatch[2].trim(),
          };
        }
        return line; // Raw string fallback
      });
    }

    if (parsedCommentsPayload.length === 0) {
      alert("Please provide valid Facebook entries or paste a valid JSON export.");
      return;
    }

    try {
      const result = await saveFacebookDrawMutation.mutateAsync({
        comments: parsedCommentsPayload,
        competitionTitle: fbCompTitle.trim() || "Facebook Giveaway Draw",
      });

      setFbResult(result);
      fetchAuditLogs();
    } catch (err: any) {
      console.error("Facebook comment picker failed:", err);
      let errorMessage = err.message || "Unknown error";
      if (errorMessage.includes("Unexpected token") || errorMessage.includes("The page")) {
        errorMessage = "Server returned an HTML error page instead of JSON. Check your backend console logs.";
      }
      alert(`Facebook picker failed: ${errorMessage}`);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-12 h-12 text-[#D4AF37] animate-spin mx-auto mb-4" />
          <p className="text-gray-300 tracking-wider">Loading The Cash King...</p>
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    return (
      <div className="min-h-screen bg-[#080808] flex items-center justify-center">
        <Card className="max-w-md w-full mx-4 bg-[#141414] border border-[#333] shadow-2xl p-6 relative">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#bf953f] via-[#fcf6ba] to-[#b38728]" />
          <div className="flex items-start gap-4 mb-4">
            <AlertCircle className="w-6 h-6 text-[#D4AF37] flex-shrink-0 mt-1" />
            <div>
              <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-[#bf953f] to-[#fcf6ba] mb-2">Access Denied</h2>
              <p className="text-gray-300 mb-6 text-sm">
                Only administrators can access the draw area. Please log in with an admin account.
              </p>
              <Button
                onClick={() => setLocation("/")}
                className="w-full bg-gradient-to-r from-[#bf953f] via-[#fcf6ba] to-[#b38728] text-black font-bold hover:opacity-90"
              >
                Return Home
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080808] text-gray-100 selection:bg-[#D4AF37] selection:text-black">
      <header className="border-b border-[#222222] bg-[#0c0c0c]/90 backdrop-blur-md sticky top-0 z-40">
        <div className="container py-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center gap-3">
              <img
                src="/tck-logo.png"
                alt="The Cash King"
                className="h-10 w-10 object-contain drop-shadow-[0_0_8px_rgba(212,175,55,0.3)]"
              />
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-[#bf953f] via-[#fcf6ba] to-[#b38728] tracking-wide uppercase flex items-center gap-2">
                  <span>♛</span> Draw Area Control Room
                </h1>
                <p className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold mt-0.5">Secure Execution Environment</p>
              </div>
            </div>

            <div className="hidden lg:flex flex-col items-center justify-center bg-[#121212] border border-[#2a2a2a] px-4 py-1.5 rounded-lg shadow-inner">
              <span className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold flex items-center gap-1">
                <Calendar className="w-3 h-3 text-[#D4AF37]" /> System Clock
              </span>
              <span className="font-mono text-xs font-bold text-[#fcf6ba]">
                {currentDateTime.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })} — {currentDateTime.toLocaleTimeString()}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2 justify-between lg:justify-end">
              <div className="flex lg:hidden flex-col bg-[#121212] border border-[#2a2a2a] px-3 py-1 rounded">
                <span className="text-[9px] text-gray-400 uppercase tracking-wider">System Clock</span>
                <span className="font-mono text-[11px] text-[#fcf6ba]">
                  {currentDateTime.toLocaleDateString()} {currentDateTime.toLocaleTimeString()}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEntryListOpen(true)}
                  className="border-[#D4AF37]/40 hover:bg-[#D4AF37]/10 text-[#fcf6ba] gap-1.5 font-bold"
                >
                  <FileSpreadsheet className="w-4 h-4 text-[#D4AF37]" /> Entry Lists
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLocation("/")}
                  className="border-[#333] hover:bg-[#1a1a1a] text-gray-300 gap-1.5 font-medium"
                >
                  <Home className="w-4 h-4" /> Home
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setLocation("/verify")}
                  className="border-[#2ecc71]/40 hover:bg-[#1b4d2e]/40 text-[#2ecc71] gap-1.5 font-bold"
                >
                  <ShieldCheck className="w-4 h-4" /> Verify Area ↗
                </Button>
                <div className="h-6 w-[1px] bg-[#333] mx-1 hidden sm:block" />
                <div className="text-left sm:text-right">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold">Operator</p>
                  <p className="text-xs font-bold text-[#D4AF37] font-mono truncate max-w-[180px]">{user.email}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container py-8 space-y-8">
        <Card className="bg-[#121212] border border-[#2a2a2a] p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#bf953f] via-[#fcf6ba] to-[#b38728]" />
          <div className="flex items-center gap-3 mb-4">
            <DownloadCloud className="w-6 h-6 text-[#D4AF37]" />
            <div>
              <h2 className="text-lg font-bold text-gray-100 tracking-wide">Automated Entry Scraper</h2>
              <p className="text-xs text-gray-400">Pull participant data streams directly into target competitions via backend worker</p>
            </div>
          </div>

          <form onSubmit={handleRunScraper} className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Competition URL Source</label>
              <input
                type="url"
                placeholder="https://example.com/competitions/entries"
                value={scraperUrl}
                onChange={(e) => setScraperUrl(e.target.value)}
                required
                className="w-full bg-[#0c0c0c] border border-[#333] rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#D4AF37]"
              />
            </div>
            <Button
              type="submit"
              disabled={scrapeEntriesMutation.isPending}
              className="bg-gradient-to-r from-[#bf953f] via-[#fcf6ba] to-[#b38728] text-black font-bold hover:opacity-90 h-[38px] md:col-span-2"
            >
              {scrapeEntriesMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Scraping & Saving...
                </>
              ) : (
                "Run Scraper Ingest"
              )}
            </Button>
          </form>
        </Card>

        {/* Facebook Comment Picker Card */}
        <Card className="bg-[#121212] border border-[#2a2a2a] p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-[#1877F2] via-[#4267B2] to-[#1877F2]" />
          <div className="flex items-center gap-3 mb-4">
            <Facebook className="w-6 h-6 text-[#1877F2]" />
            <div>
              <h2 className="text-lg font-bold text-gray-100 tracking-wide">Facebook Comment Picker</h2>
              <p className="text-xs text-gray-400">Drag and drop a JSON/TXT file, or paste your exported JSON / line-separated comments</p>
            </div>
          </div>

          <form onSubmit={handleRunFbPicker} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider">Competition Title (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Facebook Giveaway Draw"
                value={fbCompTitle}
                onChange={(e) => setFbCompTitle(e.target.value)}
                className="w-full bg-[#0c0c0c] border border-[#333] rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#1877F2]"
              />
            </div>

            {/* Drag & Drop Area */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-lg p-5 text-center transition-all ${
                isDragging
                  ? "border-[#1877F2] bg-[#1877F2]/10"
                  : "border-[#333] hover:border-[#1877F2]/50 bg-[#0c0c0c]/50"
              }`}
            >
              <div className="flex flex-col items-center justify-center gap-2">
                <Upload className={`w-8 h-8 ${isDragging ? "text-[#1877F2]" : "text-gray-500"}`} />
                <p className="text-xs text-gray-300 font-medium">
                  Drag & drop your exported <code className="text-[#1877F2]">.json</code> or <code className="text-[#1877F2]">.txt</code> file here, or{" "}
                  <label className="text-[#1877F2] hover:underline cursor-pointer font-bold">
                    browse files
                    <input
                      type="file"
                      accept=".json,.txt"
                      className="hidden"
                      onChange={handleFileInputChange}
                    />
                  </label>
                </p>
                {fileName && (
                  <div className="flex items-center gap-1.5 mt-1 text-xs text-[#2ecc71] font-mono bg-[#141414] px-3 py-1 rounded border border-[#2a2a2a]">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Loaded File: <strong>{fileName}</strong></span>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-300 uppercase tracking-wider">
                Comments Input (Paste JSON Export OR line-by-line format)
              </label>
              <textarea
                rows={5}
                placeholder={`Paste the exported [.json] content from your Extension OR use lines like:\nJohn Doe: Winning entry!\nJane Smith - Count me in`}
                value={fbCommentsText}
                onChange={(e) => setFbCommentsText(e.target.value)}
                required
                className="w-full bg-[#0c0c0c] border border-[#333] rounded px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-[#1877F2] font-mono text-xs"
              />
            </div>

            <Button
              type="submit"
              disabled={saveFacebookDrawMutation.isPending}
              className="w-full bg-[#1877F2] hover:bg-[#165fe5] text-white font-bold h-[38px]"
            >
              {saveFacebookDrawMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin mr-2" /> Processing Draw & Saving...
                </>
              ) : (
                "Pick Facebook Winner"
              )}
            </Button>
          </form>

          {/* Facebook Winner Display Box */}
          {fbResult && (
            <div className="mt-6 p-6 bg-[#0c0c0c] border border-[#2a2a2a] rounded-lg relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-[#222] pb-3 mb-6">
                <span className="text-xs font-bold text-[#1877F2] uppercase tracking-wider">
                  Draw Results
                </span>
                <span className="text-xs font-mono text-gray-400">
                  Total Entries: {fbResult.totalEntries}
                </span>
              </div>

              {fbResult.winner ? (
                <div className="bg-[#141414] border border-[#333] p-6 rounded-lg relative flex flex-col items-center text-center">
                  {/* Ticket Header Badge */}
                  <div className="flex items-center gap-2 mb-4">
                    <span className="text-xs uppercase tracking-wider font-bold text-amber-400">
                      👑 Winner Selected
                    </span>
                    <span className="text-xs text-gray-400 font-mono bg-[#080808] px-2 py-0.5 rounded border border-[#222]">
                      Ticket #{fbResult.winner.ticketNumber}
                    </span>
                  </div>

                  {/* 1. Profile Picture (Big, Centered & High-Res CDN transformed) */}
                  <div className="relative mb-3">
                    {fbResult.winner.avatarUrl || fbResult.winner.avatar ? (
                      <img
                        src={getHighResFbAvatar(fbResult.winner.avatarUrl || fbResult.winner.avatar)}
                        alt={fbResult.winner.participantName}
                        referrerPolicy="no-referrer" // 👈 Prevents Edge/Facebook CORS block
                        className="w-24 h-24 rounded-full object-cover border-4 border-[#1877F2] shadow-[0_0_20px_rgba(24,119,242,0.3)]"
                        onError={(e) => {
                          const target = e.target as HTMLImageElement;
                          const rawUrl = fbResult.winner.avatarUrl || fbResult.winner.avatar;
                          if (target.src !== rawUrl) {
                            target.src = rawUrl;
                          } else {
                            // Use winner's initials instead of a generic "FB" text box!
                            target.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                              fbResult.winner.participantName || "User"
                            )}&background=1877F2&color=fff`;
                          }
                        }}
                      />
                    ) : (
                      <div className="w-24 h-24 rounded-full bg-[#1877F2]/20 border-4 border-[#1877F2] flex items-center justify-center text-2xl font-bold text-[#1877F2] shadow-[0_0_20px_rgba(24,119,242,0.3)]">
                        FB
                      </div>
                    )}
                  </div>

                  {/* 2. Name */}
                  <div className="flex items-center justify-center gap-1.5 mb-3">
                    <h3 className="text-lg font-semibold text-gray-100">
                      {fbResult.winner.participantName}
                    </h3>
                    {(fbResult.winner.profileUrl || fbResult.winner.profile) && (
                      <a
                        href={fbResult.winner.profileUrl || fbResult.winner.profile}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#1877F2] hover:text-[#4267B2] transition-colors"
                        title="View Facebook Profile"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>

                  {/* 3. Comment Box (Centered) */}
                  {fbResult.winner.message && (
                    <div className="w-full max-w-md bg-[#080808] p-3.5 rounded-lg border border-[#222] mb-10">
                      <p className="text-sm text-gray-200 font-mono italic">
                        "{fbResult.winner.message}"
                      </p>
                    </div>
                  )}

                  {/* 4. Server Seeds (Small and tucked into the bottom corner) */}
                  <div className="mt-4 self-end text-right text-[9px] font-mono text-gray-500 space-y-0.5 opacity-75 hover:opacity-100 transition-opacity">
                    <p className="truncate max-w-[280px]">
                      <span>Hash:</span> {fbResult.proofHash}
                    </p>
                    <p className="truncate max-w-[280px]">
                      <span>Seed:</span> {fbResult.serverSeed}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-amber-500 text-center py-2">
                  No eligible entries found matching criteria.
                </p>
              )}
            </div>
          )}
        </Card>

        {/* Competition List & Historical Audits */}
        <Card className="bg-[#121212] border border-[#2a2a2a] p-6 text-gray-100 shadow-xl">
          <div className="flex items-center justify-between mb-6 border-b border-[#222] pb-4">
            <div className="flex items-center gap-2.5">
              <ListOrdered className="w-5 h-5 text-[#D4AF37]" />
              <div>
                <h2 className="text-lg font-bold text-gray-100 tracking-wide">Imported Competition Entries</h2>
                <p className="text-xs text-gray-400">Select an imported competition from Supabase to initiate a live draw</p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchImportedCompetitions}
              className="text-xs border-[#333] text-gray-300 hover:text-white hover:bg-[#1a1a1a]"
              disabled={isImportsLoading}
            >
              Refresh Imports
            </Button>
          </div>

          {isImportsLoading ? (
            <div className="text-center py-10 text-gray-500 text-sm flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37]" /> Loading imported competitions...
            </div>
          ) : importedCompetitions.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-sm">
              No imported competitions found in Supabase. Run the scraper above to ingest entries.
            </div>
          ) : (
            <div className="space-y-3">
              {importedCompetitions.map((comp) => {
                const compTitle = comp.competition_title || comp.competition_id || "Unnamed Competition";
                return (
                  <div key={comp._uniqueKey} className="flex items-center justify-between p-4 border border-[#2a2a2a] rounded-lg bg-[#0c0c0c] hover:bg-[#161616] transition-colors">
                    <div>
                      <p className="font-bold text-gray-200 text-sm sm:text-base">{compTitle}</p>
                      <p className="text-xs text-gray-400 font-mono mt-0.5">ID: {comp.competition_id || "Cleansed Import"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => {
                          setSelectedCompTarget({
                            id: comp.competition_id,
                            title: comp.competition_title || comp.competition_id
                          });
                          setActiveMode("classic");
                        }}
                        className="bg-gradient-to-r from-[#bf953f] via-[#fcf6ba] to-[#b38728] text-black font-bold hover:opacity-90 text-xs shadow-[0_0_10px_rgba(212,175,55,0.2)]"
                      >
                        Draw
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleInitiateDelete(comp)}
                        className="border-red-900/50 hover:bg-red-950/40 text-red-400 hover:text-red-300 text-xs px-2.5"
                        title="Delete Competition Entries"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Draw Modes Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="bg-[#121212] border border-[#2a2a2a] hover:border-[#D4AF37]/50 transition-all shadow-xl cursor-pointer flex flex-col justify-between p-6">
            <div className="text-center p-4">
              <div className="text-5xl mb-4 text-[#D4AF37]">♛</div>
              <h3 className="text-xl font-bold text-gray-100 mb-2">Classic Draw</h3>
              <p className="text-sm text-gray-400 mb-6">
                Instant cryptographic draw with high-visibility streaming layouts.
              </p>
            </div>
            <Button
              onClick={() => {
                setSelectedCompTarget(null);
                setActiveMode("classic");
              }}
              className="w-full bg-gradient-to-r from-[#bf953f] via-[#fcf6ba] to-[#b38728] text-black font-bold hover:opacity-90 shadow-[0_0_15px_rgba(212,175,55,0.2)]"
            >
              Launch Core Module
            </Button>
          </Card>

          <Card className="bg-[#121212] border border-[#2a2a2a] hover:border-[#D4AF37]/50 transition-all shadow-xl cursor-pointer flex flex-col justify-between p-6">
            <div className="text-center p-4">
              <div className="text-5xl mb-4 text-[#D4AF37]">◎</div>
              <h3 className="text-xl font-bold text-gray-100 mb-2">Spin Wheel <span className="text-[10px] text-amber-400 font-normal block">(Beta)</span></h3>
              <p className="text-sm text-gray-400 mb-6">
                Animated spinning wheel reveal for casual configurations.
              </p>
            </div>
            <Button
              onClick={() => setActiveMode("wheel")}
              className="w-full bg-gradient-to-r from-[#bf953f] via-[#fcf6ba] to-[#b38728] text-black font-bold hover:opacity-90 shadow-[0_0_15px_rgba(212,175,55,0.2)]"
            >
              Launch Module
            </Button>
          </Card>

          <Card className="bg-[#121212] border border-[#2a2a2a] hover:border-[#D4AF37]/50 transition-all shadow-xl cursor-pointer flex flex-col justify-between p-6">
            <div className="text-center p-4">
              <div className="text-5xl mb-4 text-[#D4AF37]">🏇</div>
              <h3 className="text-xl font-bold text-gray-100 mb-2">Horse Race</h3>
              <p className="text-sm text-gray-400 mb-6">
                Live animated computational race with custom candidate blocks.
              </p>
            </div>
            <Button
              onClick={() => setActiveMode("race")}
              className="w-full bg-gradient-to-r from-[#bf953f] via-[#fcf6ba] to-[#b38728] text-black font-bold hover:opacity-90 shadow-[0_0_15px_rgba(212,175,55,0.2)]"
            >
              Launch Module
            </Button>
          </Card>
        </div>

        {/* Audit Trail Modal */}
        <Card className="bg-[#121212] border border-[#2a2a2a] p-6 text-gray-100 shadow-xl">
          <div className="flex items-center justify-between mb-6 border-b border-[#222] pb-4">
            <div className="flex items-center gap-2.5">
              <History className="w-5 h-5 text-[#D4AF37]" />
              <div>
                <h2 className="text-lg font-bold text-gray-100 tracking-wide">Historical Draws Audit</h2>
                <p className="text-xs text-gray-400">Immutable ledger logs parsed directly out of draws_audit</p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={fetchAuditLogs}
              className="text-xs border-[#333] text-gray-300 hover:text-white hover:bg-[#1a1a1a]"
              disabled={isLogsLoading}
            >
              Refresh Logs
            </Button>
          </div>

          {isLogsLoading ? (
            <div className="text-center py-10 text-gray-500 text-sm flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#D4AF37]" /> Parsing secure database records...
            </div>
          ) : auditLogs.length === 0 ? (
            <div className="text-center py-10 text-gray-500 text-sm">
              No historical draw actions committed on this database anchor yet.
            </div>
          ) : (
            <div className="space-y-3">
              {auditLogs.map((log, logIdx) => {
                const isSelected = selectedLogId === log.draw_id;
                const dateFormatted = new Date(log.timestamp).toLocaleString();
                const totalWinnersCount = Array.isArray(log.winner_tickets) ? log.winner_tickets.length : 0;
                const totalWinnerPages = Math.ceil(totalWinnersCount / WINNERS_PER_PAGE);
                const auditUniqueKey = log.draw_id || `audit_${logIdx}`;
                
                return (
                  <div key={auditUniqueKey} className="border border-[#2a2a2a] rounded-lg overflow-hidden bg-[#0c0c0c]">
                    <div 
                      onClick={() => handleLogToggle(log.draw_id)}
                      className="flex items-center justify-between p-4 cursor-pointer hover:bg-[#161616] transition-colors select-none"
                    >
                      <div className="space-y-1 max-w-md">
                        <p className="font-bold text-[#D4AF37] text-sm sm:text-base">
                          {log.competition_title || "Unnamed Event Context"}
                        </p>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-gray-500" /> {dateFormatted}</span>
                          <span className="flex items-center gap-1"><Users className="w-3 h-3 text-gray-500" /> {Number(log.entry_count || 0).toLocaleString()} records</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-mono bg-[#141414] text-gray-400 px-2 py-1 rounded border border-[#2a2a2a]">
                          ID: {String(log.draw_id).slice(0, 8)}...
                        </span>
                        {isSelected ? <EyeOff className="w-4 h-4 text-[#D4AF37]" /> : <Eye className="w-4 h-4 text-gray-500" />}
                      </div>
                    </div>

                    {isSelected && (
                      <div className="p-4 bg-[#080808] border-t border-[#222] space-y-4">
                        <div className="grid grid-cols-2 gap-3 sm:max-w-xs">
                          <div className="bg-[#121212] border border-[#2a2a2a] p-3 rounded flex flex-col justify-between">
                            <span className="text-[9px] uppercase font-bold tracking-wider text-gray-400 flex items-center gap-1">
                              <Ticket className="w-2.5 h-2.5 text-[#D4AF37]" /> Max Ticket Count
                            </span>
                            <span className="font-mono font-bold text-sm text-gray-200 mt-1">
                              {log.total_max_tickets ? Number(log.total_max_tickets).toLocaleString() : "—"}
                            </span>
                          </div>
                          <div className="bg-[#121212] border border-[#2a2a2a] p-3 rounded flex flex-col justify-between">
                            <span className="text-[9px] uppercase font-bold tracking-wider text-gray-400 flex items-center gap-1">
                              <BarChart3 className="w-2.5 h-2.5 text-[#2ecc71]" /> Sold Tickets
                            </span>
                            <span className="font-mono font-bold text-sm text-[#2ecc71] mt-1">
                              {log.sold_tickets ? Number(log.sold_tickets).toLocaleString() : Number(log.entry_count || 0).toLocaleString()}
                            </span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div>
                            <span className="text-[9px] uppercase font-bold tracking-wider text-gray-400">Public Proof Hash</span>
                            <code className="block p-2.5 bg-[#121212] text-[10px] text-[#D4AF37] font-mono rounded truncate select-all border border-[#2a2a2a]" title={log.proof_hash}>
                              {log.proof_hash}
                            </code>
                          </div>
                          <div>
                            <span className="text-[9px] uppercase font-bold tracking-wider text-gray-400">Snapshot Entry Hash</span>
                            <code className="block p-2.5 bg-[#121212] text-[10px] text-gray-300 font-mono rounded truncate select-all border border-[#2a2a2a]" title={log.entry_hash}>
                              {log.entry_hash}
                            </code>
                          </div>
                          <div>
                            <span className="text-[9px] uppercase font-bold tracking-wider text-gray-400">Revealed Server Seed</span>
                            <code className="block p-2.5 bg-[#121212] text-[10px] text-[#2ecc71] font-mono rounded truncate select-all border border-[#2a2a2a]" title={log.server_seed}>
                              {log.server_seed}
                            </code>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between border-b border-[#222] pb-1.5">
                            <p className="text-xs font-bold text-gray-300 uppercase tracking-wide">
                              Drawn Winners Records ({totalWinnersCount})
                            </p>
                            
                            {totalWinnerPages > 1 && (
                              <div className="flex items-center gap-2 bg-[#141414] px-2 py-0.5 rounded border border-[#2a2a2a]">
                                <button
                                  type="button"
                                  onClick={() => setWinnerPage(p => Math.max(1, p - 1))}
                                  disabled={winnerPage === 1}
                                  className="text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 transition-colors text-xs px-1 font-bold"
                                >
                                  &lt;
                                </button>
                                <span className="text-[10px] font-mono font-bold text-gray-300 min-w-[65px] text-center">
                                  Page {winnerPage} / {totalWinnerPages}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setWinnerPage(p => Math.min(totalWinnerPages, p + 1))}
                                  disabled={winnerPage === totalWinnerPages}
                                  className="text-gray-400 hover:text-white disabled:opacity-30 disabled:hover:text-gray-400 transition-colors text-xs px-1 font-bold"
                                >
                                  &gt;
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {Array.isArray(log.winner_tickets) && log.winner_tickets.length > 0 ? (
                              log.winner_tickets
                                .slice((winnerPage - 1) * WINNERS_PER_PAGE, winnerPage * WINNERS_PER_PAGE)
                                .map((winner: any, idx: number) => {
                                  const globalIdx = (winnerPage - 1) * WINNERS_PER_PAGE + idx;
                                  const winnerUniqueKey = winner.ticketNumber || winner.Ticket || `winner_${globalIdx}`;
                                  return (
                                    <div key={winnerUniqueKey} className="flex justify-between items-center p-3 bg-[#121212] rounded border border-[#2a2a2a] text-xs">
                                      <div className="flex items-center gap-2 max-w-[200px] truncate">
                                        {(winner.avatarUrl || winner.avatar) && (
                                          <img 
                                            src={getHighResFbAvatar(winner.avatarUrl || winner.avatar)} 
                                            alt={winner.participantName}
                                            className="w-6 h-6 rounded-full object-cover border border-[#1877F2]"
                                          />
                                        )}
                                        <span className="font-bold text-gray-200 truncate flex items-center gap-1.5">
                                          <span className="text-gray-500 font-normal">#{globalIdx + 1}</span>
                                          {winner.participantName || winner.Name || winner.username || "Anonymous Entrant"}
                                        </span>
                                      </div>
                                      <span className="font-mono font-black text-[#D4AF37]">
                                        #{winner.ticketNumber || winner.Ticket}
                                      </span>
                                    </div>
                                  );
                                })
                            ) : (
                              <p className="text-xs text-gray-500 col-span-2 py-2">No array payload verified for this drawer.</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Modal overlays */}
        {deleteTargetComp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <Card className="max-w-md w-full bg-[#141414] border border-[#333] shadow-2xl p-6 relative">
              <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-red-600 via-orange-500 to-red-600" />
              <div className="flex items-center gap-3 mb-4">
                <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0" />
                <h3 className="text-lg font-bold text-gray-100">Delete Competition Entries</h3>
              </div>

              {isCheckingDrawStatus ? (
                <div className="py-8 text-center text-gray-400 text-sm flex items-center justify-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin text-[#D4AF37]" /> Checking audit status...
                </div>
              ) : (
                <div className="space-y-4 mb-6">
                  <p className="text-sm text-gray-300">
                    Competition: <span className="font-bold text-red-400">{deleteTargetComp.title}</span>
                  </p>
                  <div className="bg-red-950/30 border border-red-900/50 p-4 rounded-lg text-center">
                    <p className="text-base sm:text-lg font-black text-red-400 uppercase tracking-wide leading-snug">
                      {hasBeenDrawn ? "Competition has already been drawn." : "Are you sure? This hasnt been drawn yet"}
                    </p>
                  </div>
                  <div className="flex gap-3 pt-2">
                    <Button
                      variant="outline"
                      onClick={() => setDeleteTargetComp(null)}
                      className="flex-1 border-[#333] hover:bg-[#1a1a1a] text-gray-300"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={handleConfirmDelete}
                      disabled={isDeletingComp}
                      className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold"
                    >
                      {isDeletingComp ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete"}
                    </Button>
                  </div>
                </div>
              )}
            </Card>
          </div>
        )}

        {activeMode === "classic" && (
          <ClassicDraw 
            selectedCompetitionId={selectedCompTarget?.id}
            selectedCompetitionTitle={selectedCompTarget?.title}
            onClose={() => {
              setActiveMode(null);
              setSelectedCompTarget(null);
            }} 
            onNavigateToVerify={() => {
              setActiveMode(null);
              setSelectedCompTarget(null);
              setLocation("/verify");
            }}
          />
        )}
        {activeMode === "wheel" && <SpinWheel onClose={() => setActiveMode(null)} />}
        {activeMode === "race" && <HorseRace onClose={() => setActiveMode(null)} />}

        {isEntryListOpen && (
          <EntryListModal onClose={() => setIsEntryListOpen(false)} />
        )}
      </main>
    </div>
  );
}
