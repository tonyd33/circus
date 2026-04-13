import { Send } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";

export function APITester() {
  const responseInputRef = useRef<HTMLTextAreaElement>(null);
  const [statusCode, setStatusCode] = useState<number | null>(null);

  const testEndpoint = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatusCode(null);

    try {
      const form = e.currentTarget;
      const formData = new FormData(form);
      const endpoint = String(formData.get("endpoint") ?? "");
      const method = String(formData.get("method") ?? "");
      const url = new URL(endpoint, location.href);
      const res = await fetch(url, { method });

      setStatusCode(res.status);
      const data = await res.json();
      responseInputRef.current!.value = JSON.stringify(data, null, 2);
    } catch (error) {
      responseInputRef.current!.value = String(error);
    }
  };

  const statusVariant =
    statusCode === null
      ? undefined
      : statusCode >= 200 && statusCode < 300
        ? "default"
        : statusCode >= 400
          ? "destructive"
          : "secondary";

  return (
    <Card>
      <CardHeader>
        <CardTitle>API Tester</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form onSubmit={testEndpoint} className="flex items-center gap-2">
          <div className="flex flex-1 items-center rounded-md border border-input shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]">
            <Label htmlFor="method" className="sr-only">
              Method
            </Label>
            <Select name="method" defaultValue="GET">
              <SelectTrigger
                className="w-[100px] border-0 rounded-r-none shadow-none focus-visible:ring-0 focus-visible:border-transparent"
                id="method"
              >
                <SelectValue placeholder="Method" />
              </SelectTrigger>
              <SelectContent align="start">
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
              </SelectContent>
            </Select>
            <div className="h-6 w-px bg-border" />
            <Label htmlFor="endpoint" className="sr-only">
              Endpoint
            </Label>
            <Input
              id="endpoint"
              type="text"
              name="endpoint"
              defaultValue="/api/hello"
              placeholder="/api/hello"
              className="border-0 rounded-l-none shadow-none focus-visible:ring-0 focus-visible:border-transparent"
            />
          </div>
          <Button type="submit" variant="secondary" size="sm">
            <Send className="size-4 mr-1.5" />
            Send
          </Button>
        </form>

        <Separator />

        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Label className="text-sm font-medium text-muted-foreground">
              Response
            </Label>
            {statusCode !== null && statusVariant !== undefined && (
              <Badge variant={statusVariant}>{statusCode}</Badge>
            )}
          </div>
          <Textarea
            ref={responseInputRef}
            id="response"
            readOnly
            placeholder="Response will appear here..."
            className="min-h-[200px] font-mono bg-muted/50 resize-y"
          />
        </div>
      </CardContent>
    </Card>
  );
}
