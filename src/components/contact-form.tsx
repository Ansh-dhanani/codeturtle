"use client";

import React, { useState } from "react";
import { Card } from "./ui/card";
import TorchCheckbox from "./ui/torch";

const ContactForm = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    message: ''
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Handle form submission here, e.g., send to API
    console.log('Form submitted:', formData);
    // Reset form
    setFormData({ name: '', email: '', message: '' });
  };

  return (
    <Card className="flex flex-col md:flex-row space-y-8 md:space-y-0 md:space-x-8 px-6 py-6">
      
      <div className="flex-1 first-item">
        <h1 className="text-4xl font-bold mb-6">Get in Touch</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Have questions or need assistance? Fill out the form below to contact
          our support team.
        </p>
        <div className="flex flex-col items-center justify-between mt-20">
            <TorchCheckbox  />
    
        </div>
      </div>
      <div className="flex-1 second-item">
        <h2 className="text-2xl font-semibold mb-4">Contact Support</h2>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="name">
              Name
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="w-full border border-border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Your Name"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="email">
              Email
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              className="w-full border border-border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Your Email"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1" htmlFor="message">
              Message
            </label>
            <textarea
              id="message"
              name="message"
              value={formData.message}
              onChange={handleChange}
              className="w-full border border-border rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              rows={5}
              placeholder="Your Message"
              required
            ></textarea>
          </div>
          <button
            type="submit"
            className="bg-primary text-primary-foreground px-4 py-2 rounded hover:bg-primary/90 transition"
          >
            Send Message
          </button>
        </form>
      </div>
    </Card>
  );
};

export default ContactForm;
