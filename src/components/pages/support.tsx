import React from "react";
import { Poppins } from "next/font/google";
import { Card } from "../ui/card";
import {
  Book,
  HeartPlus,
  PersonStanding,
} from "lucide-react";
import Link from "next/link";
import ContactForm from "../contact-form";
const poppins = Poppins({ subsets: ["latin"], weight: ["500", "700"] });

const Support = () => {

  return (
      <div>
      <div
        className={`text-7xl font-semibold tracking-tight ${poppins.className}`}
      >
        support
      </div>
      <div>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          <Link href="/docs">
          <Card className="p-6 border border-border/50 hover:border-border transition">
            <div className="flex items-center mb-4">
              <Book className="mb-4 mr-3 h-6 w-6 text-primary" />
              <div className="text-2xl font-semibold mb-4">Documentation</div>
            </div>
            <div className="text-sm text-muted-foreground">
              Find in-depth information about CodeTurtle features and API.
            </div>
          </Card>
          </Link>
          <Card className="p-6 border border-border/50 hover:border-border transition">
            <div className="flex items-center mb-4">
              <HeartPlus className="mb-4 mr-3 h-6 w-6 text-primary" />
              <div className="text-2xl font-semibold mb-4">Community</div>
            </div>
            <div className="text-sm text-muted-foreground">
              Join the community to ask questions and find answers.
            </div>
          </Card>
          <Card className="p-6 border border-border/50 hover:border-border transition">
            <div className="flex items-center mb-4">
              <PersonStanding className="mb-4 mr-3 h-6 w-6 text-primary" />
              <div className="text-2xl font-semibold mb-4">Contact Support</div>
            </div>
            <div className="text-sm text-muted-foreground">
              Get in touch with our support team for assistance.
            </div>
          </Card>
        </div>
        <div className="mt-10">
          <ContactForm />
        </div>
      </div>
    </div>
  );
};

export default Support;
