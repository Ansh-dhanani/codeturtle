'use client';
import React from 'react';
import styled from 'styled-components';
import { toast } from 'sonner';

interface CheckboxProps {
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const TorchCheckbox: React.FC<CheckboxProps> = ({ onChange }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          const count = parseInt(localStorage.getItem('torchCount') || '0', 10) + 1;
          localStorage.setItem('torchCount', count.toString());
      
          if (count === 1) {
            toast.success('Achievement Unlocked: Fear Conquered 🔥');
          } else if (count === 2) {
            toast.success('Torch lit again! You\'re a natural! 🌟');
          } else if (count === 3) {
            toast.success('Third time\'s the charm! Keep shining! ✨');
          } else {
            toast.success(`Torch master! Lit ${count} times. You\'re unstoppable! 🚀`);
          }
        }
      } catch (error) {
        // Silently fail if localStorage is unavailable
        console.warn('localStorage unavailable:', error);
      }
    }
    onChange?.(e);
  };

  return (
    <StyledWrapper>
      <label className="container">
        <input onChange={handleChange} defaultChecked={false} type="checkbox" />
        <div className="checkmark" />
        <div className="torch">
          <div className="head">
            <div className="face top">
              <div />
              <div />
              <div />
              <div />
            </div>
            <div className="face left">
              <div />
              <div />
              <div />
              <div />
            </div>
            <div className="face right">
              <div />
              <div />
              <div />
              <div />
            </div>
          </div>
          <div className="stick">
            <div className="side side-left">
              <div />
              <div />
              <div />
              <div />
              <div />
              <div />
              <div />
              <div />
              <div />
              <div />
              <div />
              <div />
              <div />
              <div />
              <div />
              <div />
            </div>
            <div className="side side-right">
              <div />
              <div />
              <div />
              <div />
              <div />
              <div />
              <div />
              <div />
              <div />
              <div />
              <div />
              <div />
              <div />
              <div />
              <div />
              <div />
            </div>
          </div>
        </div>
      </label>
    </StyledWrapper>
  );
}

const StyledWrapper = styled.div`
  .container input {
    position: absolute;
    opacity: 0;
    cursor: pointer;
    height: 0;
    width: 0;
  }

  .container {
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    cursor: pointer;
    user-select: none;
  }

  .torch {
    display: flex;
    justify-content: center;
    height: 150px;
  }

  .head,
  .stick {
    position: absolute;
    width: 30px;
    transform-style: preserve-3d;
    transform: rotateX(-30deg) rotateY(45deg);
    backface-visibility: hidden;
  }

  .stick {
    position: relative;
    height: 120px;
  }

  .face {
    position: absolute;
    transform-style: preserve-3d;
    width: 30px;
    height: 30px;
    display: grid;
    grid-template-columns: 50% 50%;
    grid-template-rows: 50% 50%;
    gap: 0;
    background-color: #1a140d;
    transition: filter 0.3s ease;
    backface-visibility: hidden;
  }

  .top {
    transform: rotateX(90deg) translateZ(15px);
  }

  .left {
    transform: rotateY(-90deg) translateZ(15px);
  }

  .right {
    transform: rotateY(0deg) translateZ(15px);
  }

  .top div,
  .left div,
  .right div,
  .side-left div,
  .side-right div {
    width: 100%;
    height: 100%;
  }

  .top div:nth-child(1),
  .left div:nth-child(3),
  .right div:nth-child(3) {
    background-color: #2c2c25;
  }

  .top div:nth-child(2),
  .left div:nth-child(1),
  .right div:nth-child(1) {
    background-color: #221f11;
  }

  .top div:nth-child(3),
  .left div:nth-child(4),
  .right div:nth-child(4) {
    background-color: #21211c;
  }

  .top div:nth-child(4),
  .left div:nth-child(2),
  .right div:nth-child(2) {
    background-color: #1a140d;
  }

  .side {
    position: absolute;
    width: 30px;
    height: 120px;
    display: grid;
    grid-template-columns: 50% 50%;
    grid-template-rows: repeat(8, 12.5%);
    gap: 0;
    cursor: pointer;
    translate: 0 12px;
    backface-visibility: hidden;
  }

  .side-left {
    transform: rotateY(-90deg) translateZ(15px) translateY(8px);
  }

  .side-right {
    transform: rotateY(0deg) translateZ(15px) translateY(8px);
  }

  .side div:nth-child(1) {
    background-color: #443622;
  }

  .side div:nth-child(2) {
    background-color: #2e2517;
  }

  .side div:nth-child(3),
  .side div:nth-child(5) {
    background-color: #4b3b23;
  }

  .side div:nth-child(4),
  .side div:nth-child(10) {
    background-color: #251e12;
  }

  .side div:nth-child(6) {
    background-color: #292115;
  }

  .side div:nth-child(7) {
    background-color: #4b3c26;
  }

  .side div:nth-child(8) {
    background-color: #292115;
  }

  .side div:nth-child(9) {
    background-color: #4b3a21;
  }

  .side div:nth-child(11),
  .side div:nth-child(15) {
    background-color: #3d311d;
  }

  .side div:nth-child(12) {
    background-color: #2c2315;
  }

  .side div:nth-child(13) {
    background-color: #493a22;
  }

  .side div:nth-child(14) {
    background-color: #2b2114;
  }

  .side div:nth-child(16) {
    background-color: #271e10;
  }

  .container input:checked ~ .torch .face {
    filter: drop-shadow(0px 0px 2px rgb(255, 255, 255))
      drop-shadow(0px 0px 10px rgba(255, 237, 156, 0.7))
      drop-shadow(0px 0px 25px rgba(255, 227, 101, 0.4));
  }

  .container input:checked ~ .torch .top div:nth-child(1),
  .container input:checked ~ .torch .left div:nth-child(3),
  .container input:checked ~ .torch .right div:nth-child(3) {
    background-color: #ffff97;
  }

  .container input:checked ~ .torch .top div:nth-child(2),
  .container input:checked ~ .torch .left div:nth-child(1),
  .container input:checked ~ .torch .right div:nth-child(1) {
    background-color: #ffd800;
  }

  .container input:checked ~ .torch .top div:nth-child(3),
  .container input:checked ~ .torch .left div:nth-child(4),
  .container input:checked ~ .torch .right div:nth-child(4) {
    background-color: #ffffff;
  }

  .container input:checked ~ .torch .top div:nth-child(4),
  .container input:checked ~ .torch .left div:nth-child(2),
  .container input:checked ~ .torch .right div:nth-child(2) {
    background-color: #ff8f00;
  }

  .container input:checked ~ .torch .side div:nth-child(1) {
    background-color: #7c623e;
  }

  .container input:checked ~ .torch .side div:nth-child(2) {
    background-color: #4c3d26;
  }

  .container input:checked ~ .torch .side div:nth-child(3),
  .container input:checked ~ .torch .side div:nth-child(5) {
    background-color: #937344;
  }

  .container input:checked ~ .torch .side div:nth-child(4),
  .container input:checked ~ .torch .side div:nth-child(10) {
    background-color: #3c2f1c;
  }

  .container input:checked ~ .torch .side div:nth-child(6) {
    background-color: #423522;
  }

  .container input:checked ~ .torch .side div:nth-child(7) {
    background-color: #9f7f50;
  }

  .container input:checked ~ .torch .side div:nth-child(8) {
    background-color: #403320;
  }

  .container input:checked ~ .torch .side div:nth-child(9) {
    background-color: #977748;
  }

  .container input:checked ~ .torch .side div:nth-child(11),
  .container input:checked ~ .torch .side div:nth-child(15) {
    background-color: #675231;
  }

  .container input:checked ~ .torch .side div:nth-child(12) {
    background-color: #3d301d;
  }

  .container input:checked ~ .torch .side div:nth-child(13) {
    background-color: #987849;
  }

  .container input:checked ~ .torch .side div:nth-child(14) {
    background-color: #3b2e1b;
  }

  .container input:checked ~ .torch .side div:nth-child(16) {
    background-color: #372a17;
  }

  .container input:not(:checked) ~ .torch .face {
    filter: none;
  }`;

export default TorchCheckbox;
