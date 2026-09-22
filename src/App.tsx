import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { SiteCorpLayout } from "./components/sitecorp-layout";
import Index from "./pages/Index";
import Organization from "./pages/Organization";
import Candidates from "./pages/Candidates";
import Hiring from "./pages/Hiring";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<SiteCorpLayout />}>
            <Route path="/" element={<Index />} />
            <Route path="/organization" element={<Organization />} />
            <Route path="/candidates" element={<Candidates />} />
            <Route path="/hiring" element={<Hiring />} />
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
